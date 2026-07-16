import type { StorageAdapter } from "@/adapters";
import { SupabaseStorageAdapter } from "@/adapters/supabase-storage/supabase-storage-adapter";
import { requireEnv } from "@/lib/env";

let storage: StorageAdapter | undefined;

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

export { findOwnedDocument } from "./access";
export type { DocumentRow } from "./access";
export {
  completeUpload,
  createUploadSession,
  deleteDocument,
  getPreviewUrl,
  listDocuments,
  uploadPart,
} from "./service";
export type { DocumentErrorCode, DocumentResult } from "./service";
export { detectFileType, countPdfPages } from "./file-validation";
