import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { PDFDocument, StandardFonts } from "pdf-lib";
import type { ClaimedJob, EnqueueInput, QueueAdapter, QueueJobView, StorageAdapter } from "@/adapters";
import { getDb, closePool } from "@/db/client";
import { documents, extractedItemEdits, extractedItems, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import { completeUpload, createUploadSession, uploadPart } from "@/modules/documents";
import {
  confirmDocument,
  createExtractedItem,
  deleteExtractedItem,
  listExtractedItems,
  reprocessDocument,
  runExtraction,
  updateExtractedItem,
} from "@/modules/extraction";
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

  // ── E2-F3：人工確認與入庫（Sprint 9，AC-1～AC-13） ──

  it("AC-1／AC-2：PATCH 編輯內容 → 寫入異動歷史、status=edited、version+1；帶舊 version 回 VERSION_CONFLICT", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "E2-F3 編輯測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);
    const items = await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, documentId));
    const wbc = items.find((item) => item.rawTestName === "WBC")!;

    const result = await updateExtractedItem(ownerId, project.id, documentId, wbc.id, {
      version: wbc.version,
      rawValue: "6.3",
    });
    expect(result.ok && result.item.rawValue).toBe("6.3");
    expect(result.ok && result.item.status).toBe("edited");
    expect(result.ok && result.item.version).toBe(wbc.version + 1);

    const history = await getDb()
      .select()
      .from(extractedItemEdits)
      .where(eq(extractedItemEdits.extractedItemId, wbc.id));
    expect(history).toHaveLength(1);
    expect(history[0]?.previousRawValue).toBe("6.2"); // 原值保留（憲法 §4）

    const staleRetry = await updateExtractedItem(ownerId, project.id, documentId, wbc.id, {
      version: wbc.version, // 已過期
      rawValue: "9.9",
    });
    expect(staleRetry).toEqual({ ok: false, code: "VERSION_CONFLICT" });
  });

  it("AC-3：PATCH 純狀態變更（accepted，無欄位變更）→ 不寫入異動歷史", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "E2-F3 接受測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);
    const items = await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, documentId));
    const wbc = items.find((item) => item.rawTestName === "WBC")!;

    const result = await updateExtractedItem(ownerId, project.id, documentId, wbc.id, {
      version: wbc.version,
      status: "accepted",
    });
    expect(result.ok && result.item.status).toBe("accepted");

    const history = await getDb()
      .select()
      .from(extractedItemEdits)
      .where(eq(extractedItemEdits.extractedItemId, wbc.id));
    expect(history).toHaveLength(0);
  });

  it("AC-4：PATCH status=rejected → 列本身保留，不刪除", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "E2-F3 拒絕測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);
    const items = await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, documentId));
    const vitaminD = items.find((item) => item.rawTestName.includes("Vitamin"))!;

    const result = await updateExtractedItem(ownerId, project.id, documentId, vitaminD.id, {
      version: vitaminD.version,
      status: "rejected",
    });
    expect(result.ok && result.item.status).toBe("rejected");

    const stillThere = await getDb()
      .select()
      .from(extractedItems)
      .where(eq(extractedItems.id, vitaminD.id));
    expect(stillThere).toHaveLength(1);
  });

  it("AC-5：手動新增候選列（review_required 才允許）", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "E2-F3 新增測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);

    const result = await createExtractedItem(ownerId, project.id, documentId, {
      rawTestName: "Glucose",
      rawValue: "95",
      rawUnit: "mg/dL",
    });
    expect(result.ok && result.item.status).toBe("accepted");
    expect(result.ok && result.item.confidence).toBe(1.0);

    // 文件已 processing_failed（非 review_required）時不得手動新增
    const blankDocId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeBlankPdf(),
    );
    await runExtraction(storage, blankDocId);
    const blocked = await createExtractedItem(ownerId, project.id, blankDocId, {
      rawTestName: "Glucose",
      rawValue: "95",
    });
    expect(blocked).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-6：DELETE 徹底移除候選列", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "E2-F3 刪除測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);
    const items = await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, documentId));
    const wbc = items.find((item) => item.rawTestName === "WBC")!;

    const result = await deleteExtractedItem(ownerId, project.id, documentId, wbc.id);
    expect(result).toEqual({ ok: true });

    const remaining = await getDb().select().from(extractedItems).where(eq(extractedItems.id, wbc.id));
    expect(remaining).toHaveLength(0);
  });

  it("AC-7／AC-8：確認 transaction——有未處理列時擋下，全部處理完才成功並轉 confirmed", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "E2-F3 確認測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);

    const blocked = await confirmDocument(ownerId, project.id, documentId);
    expect(blocked).toEqual({ ok: false, code: "PENDING_REVIEW_ITEMS" });

    const items = await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, documentId));
    for (const item of items) {
      await updateExtractedItem(ownerId, project.id, documentId, item.id, {
        version: item.version,
        status: "accepted",
      });
    }

    const confirmed = await confirmDocument(ownerId, project.id, documentId);
    expect(confirmed).toEqual({ ok: true });

    const [document] = await getDb().select().from(documents).where(eq(documents.id, documentId));
    expect(document?.status).toBe("confirmed");
  });

  it("AC-8 延伸：文件已 confirmed 後，候選列鎖定，PATCH／DELETE 一律 INVALID_REQUEST", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "E2-F3 鎖定測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);
    const items = await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, documentId));
    for (const item of items) {
      await updateExtractedItem(ownerId, project.id, documentId, item.id, {
        version: item.version,
        status: "accepted",
      });
    }
    await confirmDocument(ownerId, project.id, documentId);

    const confirmedItems = await getDb()
      .select()
      .from(extractedItems)
      .where(eq(extractedItems.documentId, documentId));
    const target = confirmedItems[0]!;

    expect(
      await updateExtractedItem(ownerId, project.id, documentId, target.id, {
        version: target.version,
        status: "rejected",
      }),
    ).toEqual({ ok: false, code: "INVALID_REQUEST" });
    expect(await deleteExtractedItem(ownerId, project.id, documentId, target.id)).toEqual({
      ok: false,
      code: "INVALID_REQUEST",
    });
  });

  it("AC-10（四層鏈重用）：編輯／刪除／確認皆跨專案一律 PROJECT_ACCESS_DENIED", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const ownerId = await seedUser();
    const projectA = await createProject(ownerId, "E2-F3 四層鏈 A");
    const projectB = await createProject(ownerId, "E2-F3 四層鏈 B");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      projectA.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);
    const items = await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, documentId));
    const wbc = items.find((item) => item.rawTestName === "WBC")!;

    expect(
      await updateExtractedItem(ownerId, projectB.id, documentId, wbc.id, {
        version: wbc.version,
        status: "accepted",
      }),
    ).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
    expect(await deleteExtractedItem(ownerId, projectB.id, documentId, wbc.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    expect(await confirmDocument(ownerId, projectB.id, documentId)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    expect(
      await createExtractedItem(ownerId, projectB.id, documentId, { rawTestName: "X", rawValue: "1" }),
    ).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
  });

  it("AC-12：日誌不含編輯內容（項目名稱／數值等健康資料）", async () => {
    const storage = new FakeStorageAdapter();
    const queue = new FakeQueueAdapter();
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "E2-F3 日誌測試專案");
    const documentId = await setupUploadedDocument(
      storage,
      queue,
      ownerId,
      project.id,
      await makeLabReportPdf(),
    );
    await runExtraction(storage, documentId);
    const items = await getDb().select().from(extractedItems).where(eq(extractedItems.documentId, documentId));
    for (const item of items) {
      await updateExtractedItem(ownerId, project.id, documentId, item.id, {
        version: item.version,
        status: "accepted",
      });
    }
    await confirmDocument(ownerId, project.id, documentId);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain("WBC");
    expect(output).not.toContain("6.2");
    infoSpy.mockRestore();
  });
});
