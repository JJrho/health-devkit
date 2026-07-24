import { and, eq, isNull, sql } from "drizzle-orm";
import type { QueueAdapter, ScanAdapter, StorageAdapter } from "@/adapters";
import { getDb } from "@/db/client";
import { documents } from "@/db/schema";
import { withTimeout } from "@/lib/with-timeout";
import { findOwnedProject } from "@/modules/projects";
import { findOwnedDocument, type DocumentRow } from "./access";
import { countPdfPages, detectFileType } from "./file-validation";

/** C12（設定值）：本輪落地的三項數量/大小上限 */
const MAX_FILE_BYTES = 20 * 1024 * 1024;
const MAX_PDF_PAGES = 30;
const MAX_DOCUMENTS_PER_PROJECT = 200;
const PREVIEW_URL_TTL_SECONDS = 300;
/**
 * E6-F2（KB-021）：掃描逾時預算，超過視同失敗（fail closed，AC-3）。
 * 需大於 VirusTotalScanAdapter 內部輪詢預算（約 105 秒，見該檔註解），
 * 否則會在 adapter 內部輪詢尚未逾時前就被這層外部逾時提前打斷。
 */
const SCAN_TIMEOUT_MS = 120_000;
/** 可再次上傳分段／完成的狀態：uploading（首次或網路中斷）、upload_failed（內容驗證未過，換檔重試） */
const RETRYABLE_STATUSES = new Set(["uploading", "upload_failed"]);

export type DocumentErrorCode =
  | "PROJECT_ACCESS_DENIED"
  | "DOCUMENT_QUOTA_EXCEEDED"
  | "INVALID_REQUEST"
  | "FILE_TOO_LARGE"
  | "FILE_TYPE_NOT_SUPPORTED"
  | "FILE_CORRUPTED"
  | "MALICIOUS_FILE_DETECTED"
  | "FILE_SCAN_FAILED"
  | "VERSION_CONFLICT";

export type DocumentResult =
  | { ok: true; document: DocumentRow }
  | { ok: false; code: DocumentErrorCode };

function scratchPartKey(projectId: string, documentId: string, partNumber: number): string {
  return `uploads/${projectId}/${documentId}/parts/${partNumber}`;
}

function finalObjectKey(projectId: string, documentId: string, mimeType: string): string {
  const ext = mimeType === "application/pdf" ? "pdf" : mimeType === "image/png" ? "png" : "jpg";
  return `uploads/${projectId}/${documentId}/original.${ext}`;
}

/** AC-1／AC-2：建立會話——同 idempotencyKey 且未刪除已存在則冪等回傳；C12 份數上限 */
export async function createUploadSession(
  userId: string,
  projectId: string,
  input: { idempotencyKey: string; filename: string },
): Promise<DocumentResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const db = getDb();
  const existing = await db
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.projectId, project.id),
        eq(documents.idempotencyKey, input.idempotencyKey),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  if (existing[0]) return { ok: true, document: existing[0] };

  const countRows = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(documents)
    .where(and(eq(documents.projectId, project.id), isNull(documents.deletedAt)));
  if (countRows[0]!.count >= MAX_DOCUMENTS_PER_PROJECT) {
    return { ok: false, code: "DOCUMENT_QUOTA_EXCEEDED" };
  }

  const rows = await db
    .insert(documents)
    .values({
      projectId: project.id,
      idempotencyKey: input.idempotencyKey,
      filename: input.filename,
    })
    .returning();
  return { ok: true, document: rows[0]! };
}

/** AC-3：接收單一分段（暫存於 scratch；重複上傳同 part_number 直接覆寫，天然支援重試） */
export async function uploadPart(
  storage: StorageAdapter,
  userId: string,
  projectId: string,
  documentId: string,
  partNumber: number,
  body: Buffer,
): Promise<DocumentResult> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (!RETRYABLE_STATUSES.has(document.status)) return { ok: false, code: "INVALID_REQUEST" };

  await storage.putObject(
    scratchPartKey(projectId, documentId, partNumber),
    body,
    "application/octet-stream",
  );
  return { ok: true, document };
}

/**
 * AC-3～AC-5：串接分段→驗證實際內容→大小/頁數→定案；任何失敗轉 upload_failed。
 * E2-F2 起：內容驗證通過後直接轉 processing 並 enqueue 解析工作——狀態機的
 * uploaded 是概念上的瞬間過渡，本實作不另外持久化該中繼狀態（一次 DB 寫入即可）。
 */
export async function completeUpload(
  storage: StorageAdapter,
  queue: QueueAdapter,
  scan: ScanAdapter,
  userId: string,
  projectId: string,
  documentId: string,
  totalParts: number,
): Promise<DocumentResult> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (!RETRYABLE_STATUSES.has(document.status)) return { ok: false, code: "INVALID_REQUEST" };

  const partKeys = Array.from({ length: totalParts }, (_, index) =>
    scratchPartKey(projectId, documentId, index + 1),
  );

  let combined: Buffer;
  try {
    const parts = await Promise.all(partKeys.map((key) => storage.getObject(key)));
    combined = Buffer.concat(parts);
  } catch {
    return failUpload(document.id, "FILE_CORRUPTED"); // 分段缺漏視同損毀
  }

  if (combined.byteLength > MAX_FILE_BYTES) {
    await cleanupParts(storage, partKeys);
    return failUpload(document.id, "FILE_TOO_LARGE");
  }

  const detectedType = detectFileType(combined);
  if (!detectedType) {
    await cleanupParts(storage, partKeys);
    return failUpload(document.id, "FILE_TYPE_NOT_SUPPORTED");
  }

  if (detectedType === "application/pdf") {
    const pageCount = await countPdfPages(combined);
    if (pageCount === null) {
      await cleanupParts(storage, partKeys);
      return failUpload(document.id, "FILE_CORRUPTED");
    }
    if (pageCount > MAX_PDF_PAGES) {
      await cleanupParts(storage, partKeys);
      return failUpload(document.id, "FILE_TOO_LARGE");
    }
  }

  // E6-F2（KB-021，AC-1～AC-3）：內容驗證通過的檔案仍須經惡意檔案掃描才能定案；
  // 掃描判定惡意或掃描本身逾時／出錯，一律 fail closed 轉 upload_failed，
  // 絕不在掃描不可用時靜默放行（安全優先於可用性）。
  let isClean: boolean;
  try {
    isClean = await withTimeout(scan.isClean(combined), SCAN_TIMEOUT_MS);
  } catch {
    await cleanupParts(storage, partKeys);
    return failUpload(document.id, "FILE_SCAN_FAILED");
  }
  if (!isClean) {
    await cleanupParts(storage, partKeys);
    return failUpload(document.id, "MALICIOUS_FILE_DETECTED");
  }

  const finalKey = finalObjectKey(projectId, document.id, detectedType);
  await storage.putObject(finalKey, combined, detectedType);
  await cleanupParts(storage, partKeys);

  const rows = await getDb()
    .update(documents)
    .set({
      mimeType: detectedType,
      sizeBytes: combined.byteLength,
      storageKey: finalKey,
      status: "processing",
      version: document.version + 1,
      updatedAt: new Date(),
    })
    .where(eq(documents.id, document.id))
    .returning();
  await queue.enqueue({ type: "parse-document", payload: { documentId: document.id } });
  return { ok: true, document: rows[0]! };
}

async function failUpload(documentId: string, code: DocumentErrorCode): Promise<DocumentResult> {
  await getDb()
    .update(documents)
    .set({ status: "upload_failed", updatedAt: new Date() })
    .where(eq(documents.id, documentId));
  return { ok: false, code };
}

async function cleanupParts(storage: StorageAdapter, keys: string[]): Promise<void> {
  await Promise.all(keys.map((key) => storage.deleteObject(key).catch(() => undefined)));
}

/** AC-9：取消（uploading）或刪除（uploaded）皆軟刪除＋清正式物件；同 idempotencyKey 可重傳 */
export async function deleteDocument(
  storage: StorageAdapter,
  userId: string,
  projectId: string,
  documentId: string,
): Promise<DocumentResult> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  if (document.storageKey) {
    await storage.deleteObject(document.storageKey).catch(() => undefined);
  }

  const rows = await getDb()
    .update(documents)
    .set({ status: "deleted", deletedAt: new Date(), version: document.version + 1 })
    .where(eq(documents.id, document.id))
    .returning();
  return { ok: true, document: rows[0]! };
}

/**
 * E3-F2／A47：編輯 reportDate（檢驗／報告日期）——純描述性中繼資料，
 * 不比照 E2-F3 confirmed 鎖定規則，任何未刪除的文件狀態皆可編輯。
 * `reportDate: null` 代表清空日期（回到 fallback 上傳時間顯示）。
 */
export async function updateDocument(
  userId: string,
  projectId: string,
  documentId: string,
  input: { version: number; reportDate: string | null },
): Promise<DocumentResult> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (document.version !== input.version) return { ok: false, code: "VERSION_CONFLICT" };

  const rows = await getDb()
    .update(documents)
    .set({ reportDate: input.reportDate, version: document.version + 1, updatedAt: new Date() })
    .where(and(eq(documents.id, document.id), eq(documents.version, input.version)))
    .returning();
  if (!rows[0]) return { ok: false, code: "VERSION_CONFLICT" };
  return { ok: true, document: rows[0] };
}

/** AC-1（列表）：排除已刪除 */
export async function listDocuments(
  userId: string,
  projectId: string,
): Promise<{ ok: true; items: DocumentRow[] } | { ok: false; code: "PROJECT_ACCESS_DENIED" }> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const items = await getDb()
    .select()
    .from(documents)
    .where(and(eq(documents.projectId, project.id), isNull(documents.deletedAt)));
  return { ok: true, items };
}

/** AC-10：短效 signed URL（憲法 §4：不得入日誌） */
export async function getPreviewUrl(
  storage: StorageAdapter,
  userId: string,
  projectId: string,
  documentId: string,
): Promise<{ ok: true; url: string } | { ok: false; code: "PROJECT_ACCESS_DENIED" | "INVALID_REQUEST" }> {
  const document = await findOwnedDocument(userId, projectId, documentId);
  if (!document) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (!document.storageKey) return { ok: false, code: "INVALID_REQUEST" };

  const url = await storage.getSignedDownloadUrl(document.storageKey, PREVIEW_URL_TTL_SECONDS);
  return { ok: true, url };
}
