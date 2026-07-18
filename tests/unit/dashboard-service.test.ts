import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import type { ClaimedJob, EnqueueInput, QueueAdapter, QueueJobView, StorageAdapter } from "@/adapters";
import { getDb, closePool } from "@/db/client";
import { documents, extractedItems, testAliases, testDefinitionUnits, testDefinitions, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import { completeUpload, createUploadSession, updateDocument, uploadPart } from "@/modules/documents";
import { standardizeDocument } from "@/modules/observations";
import { getDashboard } from "@/modules/dashboard";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E3-F1 健康戰情整合測試（Sprint 12，AC-1～AC-5／AC-7／AC-8；連實庫）。
 * 測試帳號用 @projects.test.invalid 網域＋dash- 前綴（KB-019）。
 * AC-6（誠實佔位）為 UI 層驗收，見瀏覽器驗證；不在此檔涵蓋。
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
  await getDb().insert(users).values({ id, email: `dash-${id}@projects.test.invalid` });
  return id;
}

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

async function setupDocument(
  storage: StorageAdapter,
  queue: QueueAdapter,
  ownerId: string,
  projectId: string,
  reportDate: string,
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

  await getDb().update(documents).set({ status: "review_required" }).where(eq(documents.id, completed.document.id));
  await updateDocument(ownerId, projectId, completed.document.id, {
    version: completed.document.version,
    reportDate,
  });
  return completed.document.id;
}

async function insertCandidate(
  documentId: string,
  fields: { rawTestName: string; rawValue: string; rawUnit: string | null; rawReferenceRange?: string | null },
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
      status: "accepted",
    })
    .returning();
  return rows[0]!.id;
}

describe.skipIf(!hasDb)("dashboard module（整合，需 DATABASE_URL）", () => {
  beforeAll(async () => {
    await ensureDefinition("WBC", "10^3/uL");
    await ensureDefinition("Glucose", "mg/dL");
  });

  afterAll(async () => {
    await cleanupTestData("dash-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1／AC-8：回傳各測項最新一筆，原樣附帶參考區間、不加超標判讀", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "戰情核心測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id, "2026-03-01");
    await insertCandidate(doc, { rawTestName: "WBC", rawValue: "12.0", rawUnit: "10^3/uL", rawReferenceRange: "4.0-10.0" });
    await standardizeDocument(doc);

    const result = await getDashboard(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.currentStatus).toHaveLength(1);
    const item = result.currentStatus[0]!;
    expect(item).toMatchObject({ canonicalName: "WBC", value: "12", unit: "10^3/uL", referenceRange: "4.0-10.0" });
    // A50：即使數值 12.0 超出參考區間 4.0-10.0，回應本身不應包含任何額外的判讀/異常旗標欄位
    expect(Object.keys(item).sort()).toEqual(
      ["canonicalName", "date", "referenceRange", "testDefinitionId", "unit", "value"].sort(),
    );
  });

  it("AC-2：專案無任何 observation → 回傳空陣列，非錯誤", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "無資料測試專案");

    const result = await getDashboard(ownerId, project.id);
    expect(result).toEqual({ ok: true, currentStatus: [], earlyChanges: [] });
  });

  it("AC-3：同測項後筆大於前筆 → 標示 up", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "升降測試專案");

    const doc1 = await setupDocument(storage, queue, ownerId, project.id, "2026-01-01");
    await insertCandidate(doc1, { rawTestName: "WBC", rawValue: "5.0", rawUnit: "10^3/uL" });
    await standardizeDocument(doc1);

    const doc2 = await setupDocument(storage, queue, ownerId, project.id, "2026-02-01");
    await insertCandidate(doc2, { rawTestName: "WBC", rawValue: "6.5", rawUnit: "10^3/uL" });
    await standardizeDocument(doc2);

    const result = await getDashboard(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.earlyChanges).toEqual([{ testDefinitionId: expect.any(String), canonicalName: "WBC", direction: "up" }]);
  });

  it("AC-4：同測項僅 1 筆數值 → 不出現在早期變化清單", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "資料不足測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id, "2026-01-01");
    await insertCandidate(doc, { rawTestName: "WBC", rawValue: "6.2", rawUnit: "10^3/uL" });
    await standardizeDocument(doc);

    const result = await getDashboard(ownerId, project.id);
    expect(result.ok && result.earlyChanges).toEqual([]);
    expect(result.ok && result.currentStatus).toHaveLength(1);
  });

  it("AC-5（四層鏈重用）：跨帳號一律 PROJECT_ACCESS_DENIED", async () => {
    const ownerId = await seedUser();
    const strangerId = await seedUser();
    const project = await createProject(ownerId, "四層鏈測試專案");

    expect(await getDashboard(strangerId, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
  });

  it("AC-7（日誌 P0）：戰情查詢過程不將檢驗數值或項目名稱寫入日誌", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const doc = await setupDocument(storage, queue, ownerId, project.id, "2026-04-01");
    await insertCandidate(doc, { rawTestName: "WBC", rawValue: "6.2", rawUnit: "10^3/uL" });
    await standardizeDocument(doc);

    await getDashboard(ownerId, project.id);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain("6.2");
    expect(output).not.toContain("WBC");
    infoSpy.mockRestore();
  });
});
