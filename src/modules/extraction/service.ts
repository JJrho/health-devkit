import { eq } from "drizzle-orm";
import type { QueueAdapter, StorageAdapter } from "@/adapters";
import { getDb } from "@/db/client";
import { documents, extractedItems } from "@/db/schema";
import { logger } from "@/lib/logger";
import { findOwnedDocument } from "@/modules/documents";
import { extractCandidatesFromPage, type TextItem } from "./parser";

export type ExtractedItemRow = typeof extractedItems.$inferSelect;

/** C14：信心值門檻，< 0.85 標示待確認 */
const CONFIDENCE_THRESHOLD = 0.85;

/**
 * PoC 解析核心（A22：pdfjs-dist 伺服器端文字＋座標抽取，已驗證可行）。
 * 內部信任呼叫（Worker 觸發），不走四層鏈——payload 只含 documentId，
 * 由呼叫端（job handler）負責取得 storage 內容並在此處理。
 * 全份 PDF 完全無文字項目（如純掃描影像）視為 processing_failed（C4 範圍外）；
 * 有文字但沒有匹配到任何檢驗數據列，仍視為成功（review_required，候選為空）。
 */
export async function runExtraction(storage: StorageAdapter, documentId: string): Promise<void> {
  const db = getDb();
  const rows = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  const document = rows[0];
  if (!document || !document.storageKey) {
    throw new Error("文件不存在或尚未有最終物件");
  }

  const bytes = await storage.getObject(document.storageKey);

  // pdfjs-dist 僅在需要時載入（Worker 專用，避免拖慢 Web 端 cold start）
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  const loadingTask = pdfjs.getDocument({ data: new Uint8Array(bytes) });
  const pdf = await loadingTask.promise;

  let hasAnyText = false;
  const toInsert: Array<typeof extractedItems.$inferInsert> = [];

  try {
    for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber++) {
      const page = await pdf.getPage(pageNumber);
      const content = await page.getTextContent();
      const items: TextItem[] = [];
      for (const item of content.items) {
        if (!("str" in item) || !item.str.trim()) continue;
        hasAnyText = true;
        items.push({
          str: item.str,
          x: item.transform[4] as number,
          y: item.transform[5] as number,
          width: item.width,
          height: item.height,
        });
      }

      for (const candidate of extractCandidatesFromPage(items)) {
        toInsert.push({
          documentId: document.id,
          rawTestName: candidate.rawTestName,
          rawValue: candidate.rawValue,
          rawUnit: candidate.rawUnit,
          rawReferenceRange: candidate.rawReferenceRange,
          confidence: candidate.confidence,
          pageNumber,
          coordinates: candidate.coordinates,
          status: candidate.confidence >= CONFIDENCE_THRESHOLD ? "extracted" : "low_confidence",
        });
      }
    }
  } finally {
    await loadingTask.destroy();
  }

  if (!hasAnyText) {
    await db
      .update(documents)
      .set({ status: "processing_failed", updatedAt: new Date() })
      .where(eq(documents.id, document.id));
    logger.info("解析失敗：無文字層", { status: "processing_failed" });
    return;
  }

  if (toInsert.length > 0) {
    await db.insert(extractedItems).values(toInsert);
  }
  await db
    .update(documents)
    .set({ status: "review_required", updatedAt: new Date() })
    .where(eq(documents.id, document.id));
  logger.info("解析完成", { status: "review_required" });
}

/** 四層鏈重用（documents 的 findOwnedDocument）：列出候選項 */
export async function listExtractedItems(
  userId: string,
  projectId: string,
  documentId: string,
): Promise<{ ok: true; items: ExtractedItemRow[] } | { ok: false; code: "PROJECT_ACCESS_DENIED" }> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const items = await getDb()
    .select()
    .from(extractedItems)
    .where(eq(extractedItems.documentId, document.id));
  return { ok: true, items };
}

/** 清空既有候選列（reprocess 用；未進正式紀錄，硬刪重建無妨） */
export async function clearExtractedItems(documentId: string): Promise<void> {
  await getDb().delete(extractedItems).where(eq(extractedItems.documentId, documentId));
}

/** AC-7：reprocess——四層鏈＋清空舊候選＋重新 enqueue */
export async function reprocessDocument(
  queue: QueueAdapter,
  userId: string,
  projectId: string,
  documentId: string,
): Promise<{ ok: true } | { ok: false; code: "PROJECT_ACCESS_DENIED" | "INVALID_REQUEST" }> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (!document.storageKey) return { ok: false, code: "INVALID_REQUEST" };

  await clearExtractedItems(document.id);
  await getDb()
    .update(documents)
    .set({ status: "processing", updatedAt: new Date() })
    .where(eq(documents.id, document.id));
  await queue.enqueue({ type: "parse-document", payload: { documentId: document.id } });
  return { ok: true };
}
