import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import type { ClaimedJob, EnqueueInput, QueueAdapter, QueueJobView, StorageAdapter } from "@/adapters";
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
import { completeUpload, createUploadSession, updateDocument, uploadPart } from "@/modules/documents";
import { standardizeDocument } from "@/modules/observations";
import { getTrends } from "@/modules/trends";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E3-F2 趨勢分析整合測試（Sprint 11，AC-1～AC-7／AC-9；連實庫）。
 * 測試帳號用 @projects.test.invalid 網域＋trend- 前綴（KB-019）。
 * test_definitions 為跨測試共用參照資料（非使用者資料，不受 cleanupTestData 影響）。
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

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `trend-${id}@projects.test.invalid` });
  return id;
}

/** 冪等確保測試用標準化定義存在（比照 scripts/seed-test-definitions.ts） */
async function ensureDefinition(canonicalName: string, canonicalUnit: string): Promise<void> {
  const db = getDb();
  const existing = await db
    .select()
    .from(testDefinitions)
    .where(eq(testDefinitions.canonicalName, canonicalName))
    .limit(1);
  const definitionId =
    existing[0]?.id ??
    (await db.insert(testDefinitions).values({ canonicalName, canonicalUnit }).returning())[0]!.id;

  const existingAlias = await db
    .select()
    .from(testAliases)
    .where(eq(testAliases.aliasText, canonicalName))
    .limit(1);
  if (!existingAlias[0]) {
    await db.insert(testAliases).values({ testDefinitionId: definitionId, aliasText: canonicalName });
  }

  const existingUnit = await db
    .select()
    .from(testDefinitionUnits)
    .where(eq(testDefinitionUnits.testDefinitionId, definitionId))
    .limit(1);
  if (!existingUnit[0]) {
    await db.insert(testDefinitionUnits).values({
      testDefinitionId: definitionId,
      unitText: canonicalUnit,
      factorToCanonical: "1",
    });
  }
}

/** 建立一份 review_required 狀態的文件（跳過真實 PDF 解析，直接寫入候選列） */
async function setupDocument(
  storage: StorageAdapter,
  queue: QueueAdapter,
  ownerId: string,
  projectId: string,
  reportDate: string | null = null,
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
  const completed = await completeUpload(storage, queue, ownerId, projectId, session.document.id, 1);
  if (!completed.ok) throw new Error("setup failed: complete");

  await getDb()
    .update(documents)
    .set({ status: "review_required" })
    .where(eq(documents.id, completed.document.id));

  if (reportDate) {
    await updateDocument(ownerId, projectId, completed.document.id, {
      version: completed.document.version,
      reportDate,
    });
  }
  return completed.document.id;
}

async function insertCandidate(
  documentId: string,
  fields: {
    rawTestName: string;
    rawValue: string;
    rawUnit: string | null;
    rawReferenceRange?: string | null;
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
      rawReferenceRange: fields.rawReferenceRange ?? null,
      confidence: 0.95,
      pageNumber: 1,
      coordinates: { x: 0, y: 0, width: 0, height: 0 },
      status: fields.status,
    })
    .returning();
  return rows[0]!.id;
}

describe.skipIf(!hasDb)("trends module（整合，需 DATABASE_URL）", () => {
  beforeAll(async () => {
    await ensureDefinition("WBC", "10^3/uL");
    await ensureDefinition("Glucose", "mg/dL");
  });

  afterAll(async () => {
    await cleanupTestData("trend-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1（核心趨勢）：同一測項兩份文件、不同日期 → 回傳依日期排序的單一序列，含 value/date/referenceRange/documentId/pageNumber", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "趨勢核心測試專案");

    const doc1 = await setupDocument(storage, queue, ownerId, project.id, "2026-03-01");
    await insertCandidate(doc1, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      rawReferenceRange: "4.0-10.0",
      status: "accepted",
    });
    await standardizeDocument(doc1);

    const doc2 = await setupDocument(storage, queue, ownerId, project.id, "2026-01-01");
    await insertCandidate(doc2, {
      rawTestName: "WBC",
      rawValue: "5.0",
      rawUnit: "10^3/uL",
      rawReferenceRange: "4.0-10.0",
      status: "accepted",
    });
    await standardizeDocument(doc2);

    const result = await getTrends(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.series).toHaveLength(1);
    const series = result.series[0]!;
    expect(series.canonicalName).toBe("WBC");
    expect(series.points.map((point) => point.date)).toEqual(["2026-01-01", "2026-03-01"]);
    expect(series.points[1]!.value).toBe("6.2");
    expect(series.points[1]!.referenceRange).toBe("4.0-10.0");
    expect(series.points[1]!.documentId).toBe(doc1);
    expect(series.points[1]!.pageNumber).toBe(1);
    expect(series.points[1]!.dateEstimated).toBe(false);
  });

  it("AC-2（上游 §29 BDD：未確認資料不納入正式趨勢）：文件已辨識但尚未確認 → 不出現在任何序列", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "未確認測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id);
    await insertCandidate(doc, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "extracted", // 尚未審查／確認
    });
    await standardizeDocument(doc); // 不會建立 observation（status 非 accepted/edited）

    const result = await getTrends(ownerId, project.id);
    expect(result.ok && result.series).toEqual([]);
  });

  it("AC-3（日期 fallback）：文件 reportDate 為 null → point.date 使用 document.createdAt，dateEstimated=true", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日期 fallback 測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id, null);
    await insertCandidate(doc, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });
    await standardizeDocument(doc);

    const result = await getTrends(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const point = result.series[0]!.points[0]!;
    expect(point.dateEstimated).toBe(true);
    expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("AC-4（參考區間攜帶）：候選列 rawReferenceRange 正確攜帶至 observation 與趨勢回應", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "參考區間測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id, "2026-04-01");
    await insertCandidate(doc, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      rawReferenceRange: "4.0-10.0",
      status: "accepted",
    });
    await standardizeDocument(doc);

    const [obs] = await getDb().select().from(observations).where(eq(observations.documentId, doc));
    expect(obs?.rawReferenceRange).toBe("4.0-10.0");

    const result = await getTrends(ownerId, project.id);
    expect(result.ok && result.series[0]!.points[0]!.referenceRange).toBe("4.0-10.0");
  });

  it("AC-5（四層鏈重用）：跨帳號一律 PROJECT_ACCESS_DENIED", async () => {
    const ownerId = await seedUser();
    const strangerId = await seedUser();
    const project = await createProject(ownerId, "四層鏈測試專案");

    expect(await getTrends(strangerId, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
  });

  it("AC-6（分組不誤連）：兩個不同測項各有 observations → 回傳兩筆獨立序列", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "分組測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id, "2026-02-01");
    await insertCandidate(doc, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });
    await insertCandidate(doc, {
      rawTestName: "Glucose",
      rawValue: "95",
      rawUnit: "mg/dL",
      status: "accepted",
    });
    await standardizeDocument(doc);

    const result = await getTrends(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.series).toHaveLength(2);
    expect(result.series.map((s) => s.canonicalName).sort()).toEqual(["Glucose", "WBC"]);
    expect(result.series.every((s) => s.unitMismatch === false)).toBe(true);
  });

  it("AC-7（防護性拆分，A48）：同一 testDefinitionId 出現異常混線的 unit → 拆成獨立子序列並標記 unitMismatch", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "防護拆分測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id, "2026-05-01");
    await insertCandidate(doc, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      status: "accepted",
    });
    await standardizeDocument(doc);
    const [wbcDefinition] = await getDb()
      .select()
      .from(testDefinitions)
      .where(eq(testDefinitions.canonicalName, "WBC"));

    // 模擬資料完整性被破壞：同一 testDefinitionId 手動插入一筆不同 unit 的 observation
    await getDb()
      .insert(observations)
      .values({
        projectId: project.id,
        documentId: doc,
        extractedItemId: (
          await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, doc))
        )[0]!.id,
        testDefinitionId: wbcDefinition!.id,
        numericValue: "6200",
        unit: "/uL",
        rawValue: "6200",
        rawUnit: "/uL",
        pageNumber: 1,
        coordinates: { x: 0, y: 0, width: 0, height: 0 },
        status: "active",
      });

    const result = await getTrends(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const wbcSeries = result.series.filter((s) => s.testDefinitionId === wbcDefinition!.id);
    expect(wbcSeries).toHaveLength(2);
    expect(wbcSeries.every((s) => s.unitMismatch === true)).toBe(true);
    expect(wbcSeries.map((s) => s.unit).sort()).toEqual(["/uL", "10^3/uL"]);
  });

  it("AC-9（日誌 P0）：趨勢查詢過程不將檢驗數值或項目名稱寫入日誌", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id, "2026-06-01");
    await insertCandidate(doc, {
      rawTestName: "WBC",
      rawValue: "6.2",
      rawUnit: "10^3/uL",
      rawReferenceRange: "4.0-10.0",
      status: "accepted",
    });
    await standardizeDocument(doc);

    await getTrends(ownerId, project.id);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain("6.2");
    expect(output).not.toContain("WBC");
    infoSpy.mockRestore();
  });
});
