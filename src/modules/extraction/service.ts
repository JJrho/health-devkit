import { and, eq, notInArray, sql } from "drizzle-orm";
import type { QueueAdapter, StorageAdapter } from "@/adapters";
import { getDb } from "@/db/client";
import { documents, extractedItemEdits, extractedItems } from "@/db/schema";
import { logger } from "@/lib/logger";
import { findOwnedDocument, type DocumentRow } from "@/modules/documents";
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

/**
 * 四層鏈重用＋確認候選列確實屬於該文件（避免跨文件 id 亂猜）。
 * 文件必須仍在 review_required——一旦 confirmed，候選列即鎖定，不得再透過本組
 * 端點編輯／刪除（要修改需先走 reprocess 轉回 review_required，非本輪範圍，見 A38）。
 */
async function findOwnedExtractedItem(
  userId: string,
  projectId: string,
  documentId: string,
  extractedItemId: string,
): Promise<
  | { ok: true; document: DocumentRow; item: ExtractedItemRow }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" | "INVALID_REQUEST" }
> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (document.status !== "review_required") return { ok: false, code: "INVALID_REQUEST" };

  const rows = await getDb()
    .select()
    .from(extractedItems)
    .where(and(eq(extractedItems.id, extractedItemId), eq(extractedItems.documentId, document.id)))
    .limit(1);
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, document, item: rows[0] };
}

/**
 * 上游 §28.4「可新增」（AC-5）：AI 漏掉某列檢驗數據時，使用者手動輸入。
 * 手動輸入視同使用者已確認正確，status 直接為 accepted，不經信心值流程；
 * 文件必須在 review_required（尚在審查階段）才能新增，避免對已確認文件動手腳。
 */
export async function createExtractedItem(
  userId: string,
  projectId: string,
  documentId: string,
  input: {
    rawTestName: string;
    rawValue: string;
    rawUnit?: string | null;
    rawReferenceRange?: string | null;
    pageNumber?: number;
  },
): Promise<
  | { ok: true; item: ExtractedItemRow }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "INVALID_REQUEST" }
> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (document.status !== "review_required") return { ok: false, code: "INVALID_REQUEST" };
  if (!input.rawTestName.trim() || !input.rawValue.trim()) {
    return { ok: false, code: "INVALID_REQUEST" };
  }

  const rows = await getDb()
    .insert(extractedItems)
    .values({
      documentId: document.id,
      rawTestName: input.rawTestName,
      rawValue: input.rawValue,
      rawUnit: input.rawUnit ?? null,
      rawReferenceRange: input.rawReferenceRange ?? null,
      confidence: 1.0,
      pageNumber: input.pageNumber ?? 1,
      coordinates: { x: 0, y: 0, width: 0, height: 0 },
      status: "accepted",
    })
    .returning();
  return { ok: true, item: rows[0]! };
}

/**
 * 上游 §28.4「可修改」＋「確認後有版本紀錄」（AC-1～AC-3）：編輯內容或變更狀態合一。
 * 帶 rawTestName/rawValue/rawUnit/rawReferenceRange 任一者 → 視為內容編輯：
 *   寫入 extracted_item_edits（A36，保留編輯前的值）、status 轉 edited。
 * 只帶 status（accepted/rejected）、未帶欄位 → 純狀態變更，不寫入歷史（無內容變動可保留）。
 * 皆需帶入呼叫端目前所知的 version 做樂觀鎖（VERSION_CONFLICT）。
 */
export async function updateExtractedItem(
  userId: string,
  projectId: string,
  documentId: string,
  extractedItemId: string,
  input: {
    version: number;
    rawTestName?: string;
    rawValue?: string;
    rawUnit?: string | null;
    rawReferenceRange?: string | null;
    status?: "accepted" | "rejected";
  },
): Promise<
  | { ok: true; item: ExtractedItemRow }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" | "VERSION_CONFLICT" | "INVALID_REQUEST" }
> {
  const found = await findOwnedExtractedItem(userId, projectId, documentId, extractedItemId);
  if (!found.ok) return found;
  const current = found.item;
  if (current.version !== input.version) return { ok: false, code: "VERSION_CONFLICT" };

  const hasFieldEdit =
    input.rawTestName !== undefined ||
    input.rawValue !== undefined ||
    input.rawUnit !== undefined ||
    input.rawReferenceRange !== undefined;

  const db = getDb();

  if (hasFieldEdit) {
    const newRawTestName = input.rawTestName ?? current.rawTestName;
    const newRawValue = input.rawValue ?? current.rawValue;
    if (!newRawTestName.trim() || !newRawValue.trim()) return { ok: false, code: "INVALID_REQUEST" };

    const rows = await db.transaction(async (tx) => {
      await tx.insert(extractedItemEdits).values({
        extractedItemId: current.id,
        previousRawTestName: current.rawTestName,
        previousRawValue: current.rawValue,
        previousRawUnit: current.rawUnit,
        previousRawReferenceRange: current.rawReferenceRange,
      });
      return tx
        .update(extractedItems)
        .set({
          rawTestName: newRawTestName,
          rawValue: newRawValue,
          rawUnit: input.rawUnit !== undefined ? input.rawUnit : current.rawUnit,
          rawReferenceRange:
            input.rawReferenceRange !== undefined ? input.rawReferenceRange : current.rawReferenceRange,
          status: "edited",
          version: current.version + 1,
          updatedAt: new Date(),
        })
        .where(and(eq(extractedItems.id, current.id), eq(extractedItems.version, input.version)))
        .returning();
    });
    if (!rows[0]) return { ok: false, code: "VERSION_CONFLICT" };
    return { ok: true, item: rows[0] };
  }

  if (input.status === undefined) return { ok: false, code: "INVALID_REQUEST" };
  const rows = await db
    .update(extractedItems)
    .set({ status: input.status, version: current.version + 1, updatedAt: new Date() })
    .where(and(eq(extractedItems.id, current.id), eq(extractedItems.version, input.version)))
    .returning();
  if (!rows[0]) return { ok: false, code: "VERSION_CONFLICT" };
  return { ok: true, item: rows[0] };
}

/**
 * 上游 §28.4／§17「刪除」（AC-6）：徹底移除，與 status=rejected（保留列供回查）語意不同（A37）。
 * 適用情境：手動新增後反悔、或明顯雜訊不需要留存紀錄。
 */
export async function deleteExtractedItem(
  userId: string,
  projectId: string,
  documentId: string,
  extractedItemId: string,
): Promise<
  { ok: true } | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" | "INVALID_REQUEST" }
> {
  const found = await findOwnedExtractedItem(userId, projectId, documentId, extractedItemId);
  if (!found.ok) return found;

  await getDb().delete(extractedItems).where(eq(extractedItems.id, found.item.id));
  return { ok: true };
}

/**
 * 確認 transaction（AC-7／AC-8；上游 §18.1：review_required → confirmed）。
 * A38：要求該文件底下所有候選列皆已到達審查終態（edited/accepted/rejected），
 * 不允許還有 extracted/low_confidence 殘留就確認——避免使用者漏看某列。
 */
export async function confirmDocument(
  userId: string,
  projectId: string,
  documentId: string,
): Promise<
  | { ok: true }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "INVALID_REQUEST" | "PENDING_REVIEW_ITEMS" }
> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (document.status !== "review_required") return { ok: false, code: "INVALID_REQUEST" };

  const db = getDb();
  const pending = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(extractedItems)
    .where(
      and(
        eq(extractedItems.documentId, document.id),
        notInArray(extractedItems.status, ["edited", "accepted", "rejected"]),
      ),
    );
  if (pending[0]!.count > 0) return { ok: false, code: "PENDING_REVIEW_ITEMS" };

  await db
    .update(documents)
    .set({ status: "confirmed", version: document.version + 1, updatedAt: new Date() })
    .where(eq(documents.id, document.id));
  logger.info("文件已確認", { status: "confirmed" });
  return { ok: true };
}
