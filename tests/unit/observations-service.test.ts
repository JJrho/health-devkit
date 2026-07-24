import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import type { ClaimedJob, EnqueueInput, QueueAdapter, QueueJobView, ScanAdapter, StorageAdapter } from "@/adapters";
import { getDb, closePool } from "@/db/client";
import {
  documents,
  extractedItems,
  observations,
  testAliases,
  testDefinitionUnits,
  testDefinitions,
  users,
} from "@/db/schema";
import { createProject } from "@/modules/projects";
import { completeUpload, createUploadSession, uploadPart } from "@/modules/documents";
import { confirmDocument, updateExtractedItem } from "@/modules/extraction";
import {
  deleteObservation,
  listObservations,
  standardizeDocument,
  updateObservation,
} from "@/modules/observations";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E2-F4 標準化與正式紀錄整合測試（Sprint 10，AC-1～AC-9；連實庫）。
 * 測試帳號用 @projects.test.invalid 網域＋observ- 前綴（KB-019）。
 * test_definitions／test_aliases／test_definition_units 為跨測試共用的參照資料
 * （非使用者資料，不受 cleanupTestData 影響），beforeAll 冪等確保存在。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

class FakeStorageAdapter implements StorageAdapter {
  private store = new Map<string, Buffer>();
  async putObject(key: string, body: Buffer): Promise<void> {
    this.store.set(key, body);
  }
  async getObject(key: string): Promise<Buffer> {
    const value = this.store.get(key);
    if (!value) throw new Error(`not found: ${key}`);
    return value;
  }
  async getSignedDownloadUrl(key: string): Promise<string> {
    return `https://fake-storage.invalid/${key}`;
  }
  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class FakeQueueAdapter implements QueueAdapter {
  enqueued: EnqueueInput[] = [];
  async enqueue(input: EnqueueInput): Promise<{ id: string }> {
    this.enqueued.push(input);
    return { id: randomUUID() };
  }
  async claimNext(): Promise<ClaimedJob | null> {
    return null;
  }
  async complete(): Promise<void> {}
  async fail(): Promise<void> {}
  async getJob(): Promise<QueueJobView | null> {
    return null;
  }
}

class FakeScanAdapter implements ScanAdapter {
  async isClean(): Promise<boolean> {
    return true;
  }
}

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `observ-${id}@projects.test.invalid` });
  return id;
}

/** 確保「WBC」測試用標準化定義存在（冪等，比照 scripts/seed-test-definitions.ts） */
async function ensureWbcDefinition(): Promise<void> {
  const db = getDb();
  const existing = await db
    .select()
    .from(testDefinitions)
    .where(eq(testDefinitions.canonicalName, "WBC"))
    .limit(1);
  const definitionId =
    existing[0]?.id ??
    (
      await db
        .insert(testDefinitions)
        .values({ canonicalName: "WBC", canonicalUnit: "10^3/uL" })
        .returning()
    )[0]!.id;

  const existingAlias = await db
    .select()
    .from(testAliases)
    .where(eq(testAliases.aliasText, "WBC"))
    .limit(1);
  if (!existingAlias[0]) {
    await db.insert(testAliases).values({ testDefinitionId: definitionId, aliasText: "WBC" });
  }

  const existingUnit = await db
    .select()
    .from(testDefinitionUnits)
    .where(eq(testDefinitionUnits.testDefinitionId, definitionId))
    .limit(1);
  if (!existingUnit[0]) {
    await db.insert(testDefinitionUnits).values({
      testDefinitionId: definitionId,
      unitText: "10^3/uL",
      factorToCanonical: "1",
    });
  }
}

/** 建立一份 review_required 狀態的文件（跳過真實 PDF 解析，直接寫入候選列） */
async function setupReviewRequiredDocument(
  storage: StorageAdapter,
  queue: QueueAdapter,
  ownerId: string,
  projectId: string,
): Promise<string> {
  const session = await createUploadSession(ownerId, projectId, {
    idempotencyKey: randomUUID(),
    filename: "report.pdf",
  });
  if (!session.ok) throw new Error("setup failed");
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage();
  const pdfBytes = Buffer.from(await pdfDoc.save());
  await uploadPart(storage, ownerId, projectId, session.document.id, 1, pdfBytes);
  const completed = await completeUpload(storage, queue, new FakeScanAdapter(), ownerId, projectId, session.document.id, 1);
  if (!completed.ok) throw new Error("setup failed: complete");

  await getDb()
    .update(documents)
    .set({ status: "review_required" })
    .where(eq(documents.id, completed.document.id));
  return completed.document.id;
}

async function insertCandidate(
  documentId: string,
  fields: {
    rawTestName: string;
    rawValue: string;
    rawUnit: string | null;
    status: string;
  },
): Promise<string> {
  const rows = await getDb()
    .insert(extractedItems)
    .values({
      documentId,
      rawTestName: fields.rawTestName,
      rawValue: fields.rawValue,
      rawUnit: fields.rawUnit,
      confidence: 0.95,
      pageNumber: 1,
      coordinates: { x: 0, y: 0, width: 0, height: 0 },
      status: fields.status,
    })
    .returning();
  return rows[0]!.id;
}

describe.skipIf(!hasDb)("observations module（整合，需 DATABASE_URL）", () => {
  beforeAll(async () => {
    await ensureWbcDefinition();
  });

  afterAll(async () => {
    await cleanupTestData("observ-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1：別名比對成功＋單位在白名單內 → 建立 observation，numericValue 正確換算", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "標準化測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });

    await standardizeDocument(documentId);

    const rows = await getDb().select().from(observations).where(eq(observations.documentId, documentId));
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ unit: "10^3/uL", rawValue: "6.2", status: "active" });
    expect(Number(rows[0]!.numericValue)).toBeCloseTo(6.2);
  });

  it("AC-2：別名庫未涵蓋的項目 → 不建立 observation，extracted_items 不受影響", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "標準化測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    const itemId = await insertCandidate(documentId, {
      rawTestName: "UnknownTestXYZ",
      rawValue: "1.0",
      rawUnit: "unit",
      status: "accepted",
    });

    await standardizeDocument(documentId);

    const rows = await getDb().select().from(observations).where(eq(observations.documentId, documentId));
    expect(rows).toHaveLength(0);
    const item = await getDb().select().from(extractedItems).where(eq(extractedItems.id, itemId));
    expect(item).toHaveLength(1);
  });

  it("AC-3：別名比對成功但單位不在白名單內（或無單位）→ 不建立 observation", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "標準化測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "not-a-real-unit",
      status: "accepted",
    });
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "7.0",
      rawUnit: null,
      status: "accepted",
    });

    await standardizeDocument(documentId);

    const rows = await getDb().select().from(observations).where(eq(observations.documentId, documentId));
    expect(rows).toHaveLength(0);
  });

  it("AC-4：status=rejected 的候選列不參與標準化", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "標準化測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "rejected",
    });

    await standardizeDocument(documentId);

    const rows = await getDb().select().from(observations).where(eq(observations.documentId, documentId));
    expect(rows).toHaveLength(0);
  });

  it("AC-5（版本鏈）：PATCH 修正數值 → 新增新版本、舊列轉 superseded", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "標準化測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });
    await standardizeDocument(documentId);
    const [original] = await getDb().select().from(observations).where(eq(observations.documentId, documentId));

    const result = await updateObservation(ownerId, project.id, original!.id, {
      version: original!.version,
      numericValue: "6.5",
    });
    expect(result.ok && result.item.numericValue).toBe("6.5");
    expect(result.ok && result.item.version).toBe(original!.version + 1);
    expect(result.ok && result.item.status).toBe("active");

    const [oldRow] = await getDb().select().from(observations).where(eq(observations.id, original!.id));
    expect(oldRow?.status).toBe("superseded");

    // 舊版本仍可查詢（原值不會消失）
    expect(Number(oldRow?.numericValue)).toBeCloseTo(6.2);
  });

  it("AC-6a（同一使用者，錯誤的專案範圍）：observation 存在專案 A，用該使用者名下的專案 B 查／改／刪一律 NOT_FOUND（比照 findOwnedExtractedItem 對子資源不屬於指定父層的既有處理慣例，不誤判為跨帳號）", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const projectA = await createProject(ownerId, "四層鏈 A");
    const projectB = await createProject(ownerId, "四層鏈 B");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, projectA.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });
    await standardizeDocument(documentId);
    const [obs] = await getDb().select().from(observations).where(eq(observations.documentId, documentId));

    // projectB 合法屬於 ownerId，但底下沒有這筆 observation——list 正確回空陣列，非錯誤
    const emptyResult = await listObservations(ownerId, projectB.id);
    expect(emptyResult).toEqual({ ok: true, items: [] });

    expect(
      await updateObservation(ownerId, projectB.id, obs!.id, { version: obs!.version, numericValue: "1" }),
    ).toEqual({ ok: false, code: "NOT_FOUND" });
    expect(await deleteObservation(ownerId, projectB.id, obs!.id)).toEqual({
      ok: false,
      code: "NOT_FOUND",
    });

    const okResult = await listObservations(ownerId, projectA.id);
    expect(okResult.ok && okResult.items).toHaveLength(1);
    expect(okResult.ok && okResult.items[0]!.canonicalName).toBe("WBC");
  });

  it("AC-6b（跨帳號）：其他使用者完全不擁有該專案，list／改／刪一律 PROJECT_ACCESS_DENIED", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const strangerId = await seedUser();
    const project = await createProject(ownerId, "跨帳號測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });
    await standardizeDocument(documentId);
    const [obs] = await getDb().select().from(observations).where(eq(observations.documentId, documentId));

    expect(await listObservations(strangerId, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    expect(
      await updateObservation(strangerId, project.id, obs!.id, { version: obs!.version, numericValue: "1" }),
    ).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
    expect(await deleteObservation(strangerId, project.id, obs!.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
  });

  it("AC-7（憲法 §4 numeric 落地）：numericValue 欄位型別為 numeric，非文字", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "numeric 測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });
    await standardizeDocument(documentId);

    const columnType = await getDb().execute(
      `select data_type from information_schema.columns where table_name = 'observations' and column_name = 'numeric_value'`,
    );
    expect((columnType.rows[0] as { data_type: string }).data_type).toBe("numeric");
  });

  it("AC-8（日誌 P0）：標準化過程不將候選列或正式紀錄內容寫入日誌", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });

    await standardizeDocument(documentId);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain("6.2");
    infoSpy.mockRestore();
  });

  it("AC-9：confirmDocument 成功後自動 enqueue standardize-document 工作", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "自動觸發測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    const itemId = await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "extracted",
    });
    await updateExtractedItem(ownerId, project.id, documentId, itemId, {
      version: 1,
      status: "accepted",
    });

    const result = await confirmDocument(queue, ownerId, project.id, documentId);
    expect(result).toEqual({ ok: true });
    expect(queue.enqueued.filter((job) => job.type === "standardize-document")).toHaveLength(1);
  });

  it("軟刪除：DELETE 後不再出現於 listObservations", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "刪除測試專案");
    const documentId = await setupReviewRequiredDocument(storage, queue, ownerId, project.id);
    await insertCandidate(documentId, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });
    await standardizeDocument(documentId);
    const [obs] = await getDb().select().from(observations).where(eq(observations.documentId, documentId));

    const result = await deleteObservation(ownerId, project.id, obs!.id);
    expect(result).toEqual({ ok: true });

    const afterDelete = await listObservations(ownerId, project.id);
    expect(afterDelete.ok && afterDelete.items).toHaveLength(0);
  });
});
