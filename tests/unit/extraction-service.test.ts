import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ClaimedJob, EnqueueInput, QueueAdapter, QueueJobView, StorageAdapter } from "@/adapters";
import { getDb, closePool } from "@/db/client";
import { documents, extractedItems, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import { completeUpload, createUploadSession, uploadPart } from "@/modules/documents";
import { listExtractedItems, reprocessDocument, runExtraction } from "@/modules/extraction";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * 解析管線整合測試（E2-F2，AC-1～AC-9；連實庫，Storage/Queue 以記憶體假實作取代）。
 * 測試帳號用 @projects.test.invalid 網域＋extract- 前綴（KB-019）。
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
  await getDb().insert(users).values({ id, email: `extract-${id}@projects.test.invalid` });
  return id;
}

/** 產生帶清楚檢驗數據列的 PDF（純 ASCII，避開 pdf-lib 標準字型無法編碼 CJK 的限制） */
async function makeLabReportPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const page = doc.addPage([595, 842]);
  const lines = ["Health Check Report", "WBC 6.2 10^3/uL 4.0-10.0", "Vitamin D 32"];
  let y = 780;
  for (const line of lines) {
    page.drawText(line, { x: 50, y, size: 12, font });
    y -= 30;
  }
  return Buffer.from(await doc.save());
}

/** 無文字層的 PDF（空白頁），模擬掃描影像等情況（C4 範圍外） */
async function makeBlankPdf(): Promise<Buffer> {
  const doc = await PDFDocument.create();
  doc.addPage();
  return Buffer.from(await doc.save());
}

async function setupUploadedDocument(
  storage: StorageAdapter,
  queue: QueueAdapter,
  ownerId: string,
  projectId: string,
  pdfBytes: Buffer,
): Promise<string> {
  const session = await createUploadSession(ownerId, projectId, {
    idempotencyKey: randomUUID(),
    filename: "report.pdf",
  });
  if (!session.ok) throw new Error("setup failed");
  await uploadPart(storage, ownerId, projectId, session.document.id, 1, pdfBytes);
  const completed = await completeUpload(storage, queue, ownerId, projectId, session.document.id, 1);
  if (!completed.ok) throw new Error("setup failed: complete");
  return completed.document.id;
}

describe.skipIf(!hasDb)("extraction module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("extract-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1／AC-2／AC-3：解析清楚的檢驗列 → extracted（高信心）；模糊列 → low_confidence", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "解析測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );

    await runExtraction(storage, documentId);

    const [document] = await getDb().select().from(documents).where(eq(documents.id, documentId));
    expect(document?.status).toBe("review_required");

    const items = await getDb()
      .select()
      .from(extractedItems)
      .where(eq(extractedItems.documentId, documentId));
    const wbc = items.find((item) => item.rawTestName === "WBC");
    expect(wbc).toMatchObject({ rawValue: "6.2", rawUnit: "10^3/uL", status: "extracted" });
    expect(wbc!.confidence).toBeGreaterThanOrEqual(0.85);

    const vitaminD = items.find((item) => item.rawTestName.includes("Vitamin"));
    expect(vitaminD?.status).toBe("low_confidence");
  });

  it("AC-4：無文字層的 PDF → processing_failed，不誤植假資料", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "解析測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeBlankPdf(),
    );

    await runExtraction(storage, documentId);

    const [document] = await getDb().select().from(documents).where(eq(documents.id, documentId));
    expect(document?.status).toBe("processing_failed");

    const items = await getDb()
      .select()
      .from(extractedItems)
      .where(eq(extractedItems.documentId, documentId));
    expect(items).toHaveLength(0);
  });

  it("AC-6（四層鏈重用）：候選項存在專案 A，用專案 B 的 id 查一律 PROJECT_ACCESS_DENIED", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const projectA = await createProject(ownerId, "專案 A");
    const projectB = await createProject(ownerId, "專案 B");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      projectA.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);

    expect(await listExtractedItems(ownerId, projectB.id, documentId)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    const okResult = await listExtractedItems(ownerId, projectA.id, documentId);
    expect(okResult.ok && okResult.items.length).toBeGreaterThan(0);
  });

  it("AC-7：reprocess 清空舊候選、重新 enqueue", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "reprocess 測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);

    const before = await getDb()
      .select()
      .from(extractedItems)
      .where(eq(extractedItems.documentId, documentId));
    expect(before.length).toBeGreaterThan(0);

    const result = await reprocessDocument(queue, ownerId, project.id, documentId);
    expect(result).toEqual({ ok: true });

    const after = await getDb()
      .select()
      .from(extractedItems)
      .where(eq(extractedItems.documentId, documentId));
    expect(after).toHaveLength(0);

    const [document] = await getDb().select().from(documents).where(eq(documents.id, documentId));
    expect(document?.status).toBe("processing");
    expect(queue.enqueued.filter((job) => job.type === "parse-document")).toHaveLength(2); // 上傳自動觸發一次＋reprocess 一次
  });

  it("AC-8：日誌不含抽取內容（項目名稱／數值等健康資料）", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );

    await runExtraction(storage, documentId);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain("WBC");
    expect(output).not.toContain("6.2");
    infoSpy.mockRestore();
  });
});
