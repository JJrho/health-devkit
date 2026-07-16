import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { StorageAdapter } from "../storage-adapter";

/**
 * StorageAdapter 的 Supabase Storage 實作（E2-F1，A18）。
 * 私有 bucket；上傳一律走伺服器端中介（本站 session 與 Supabase Auth JWT 脫鉤，
 * 不做瀏覽器直連的 RLS 授權）。bucket 需存在，見 scripts/setup-storage.ts（一次性、冪等）。
 */
export const DOCUMENTS_BUCKET = "documents";

export class SupabaseStorageAdapter implements StorageAdapter {
  private readonly client: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.client = createClient(url, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }

  async putObject(key: string, body: Buffer, contentType: string): Promise<void> {
    const { error } = await this.client.storage
      .from(DOCUMENTS_BUCKET)
      .upload(key, body, { contentType, upsert: true });
    if (error) throw new Error(`Storage 上傳失敗：${error.message}`);
  }

  async getObject(key: string): Promise<Buffer> {
    const { data, error } = await this.client.storage.from(DOCUMENTS_BUCKET).download(key);
    if (error || !data) throw new Error(`Storage 讀取失敗：${error?.message ?? "unknown"}`);
    return Buffer.from(await data.arrayBuffer());
  }

  async getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string> {
    const { data, error } = await this.client.storage
      .from(DOCUMENTS_BUCKET)
      .createSignedUrl(key, expiresInSeconds);
    if (error || !data) throw new Error(`Storage 簽署網址失敗：${error?.message ?? "unknown"}`);
    return data.signedUrl;
  }

  async deleteObject(key: string): Promise<void> {
    const { error } = await this.client.storage.from(DOCUMENTS_BUCKET).remove([key]);
    if (error) throw new Error(`Storage 刪除失敗：${error.message}`);
  }
}
