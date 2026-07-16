/**
 * StorageAdapter 介面（憲法 §1、§4：bucket 私有、下載走短效 signed URL）。
 * Sprint 1 僅定義介面；實作於 E2-F1（上傳會話與預覽）。
 */
export interface StorageAdapter {
  /** 上傳物件（內容驗證由呼叫端於 adapter 之前完成） */
  putObject(key: string, body: Buffer, contentType: string): Promise<void>;
  /** 讀回物件內容（E2-F1：分段上傳於 complete 時串接用） */
  getObject(key: string): Promise<Buffer>;
  /** 產生短效簽名下載網址（憲法 §4：signed URL 不得入日誌） */
  getSignedDownloadUrl(key: string, expiresInSeconds: number): Promise<string>;
  /** 永久刪除物件（配合 C10 刪除鏈） */
  deleteObject(key: string): Promise<void>;
}
