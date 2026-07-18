import type { QueueAdapter, StorageAdapter } from "@/adapters";
import { SupabaseStorageAdapter } from "@/adapters/supabase-storage/supabase-storage-adapter";
import { PgQueueAdapter } from "@/adapters/pg-queue/pg-queue-adapter";
import { getPool } from "@/db/client";
import { requireEnv } from "@/lib/env";

let storage: StorageAdapter | undefined;
let queue: QueueAdapter | undefined;

/** documents 模組組裝點：正式環境的 StorageAdapter 單例（Supabase Storage，A18） */
export function getStorageAdapter(): StorageAdapter {
  if (!storage) {
    storage = new SupabaseStorageAdapter(
      requireEnv("SUPABASE_URL"),
      requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    );
  }
  return storage;
}

/** documents 模組組裝點：正式環境的 QueueAdapter 單例（C2 PG queue；E2-F2 起用於觸發解析） */
export function getQueueAdapter(): QueueAdapter {
  if (!queue) {
    queue = new PgQueueAdapter(getPool());
  }
  return queue;
}

export { findOwnedDocument } from "./access";
export type { DocumentRow } from "./access";
export {
  completeUpload,
  createUploadSession,
  deleteDocument,
  getPreviewUrl,
  listDocuments,
  updateDocument,
  uploadPart,
} from "./service";
export type { DocumentErrorCode, DocumentResult } from "./service";
export { detectFileType, countPdfPages } from "./file-validation";
