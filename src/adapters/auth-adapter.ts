/**
 * AuthAdapter 介面（憲法 §1；E1-F2 擴充定稿）。
 * 職責邊界：憑證與信件（密碼雜湊、驗證信、重設信）歸外部 Auth 服務；
 * session、鎖定、同意紀錄屬應用層（src/modules/auth），不在此介面。
 */
export interface AuthAdapter {
  /**
   * 註冊：建立憑證並觸發驗證信。
   * Email 已存在時回 "EMAIL_EXISTS"（SDD §4.1：註冊側明確提示既有帳號）；
   * Email 格式不合法時回 "INVALID_EMAIL"（可預期的使用者輸入錯誤，不應以例外處理）。
   * 其餘非預期錯誤（服務中斷等）才拋出例外，由呼叫端當系統錯誤處理。
   */
  register(
    email: string,
    password: string,
    verifyRedirectTo: string,
  ): Promise<
    { userId: string } | "EMAIL_EXISTS" | "INVALID_EMAIL" | "EMAIL_RATE_LIMITED"
  >;

  /** 驗證密碼；失敗回 null（呼叫端統一錯誤，不洩漏存在性） */
  verifyPassword(
    email: string,
    password: string,
  ): Promise<{ userId: string; emailVerified: boolean } | null>;

  /**
   * 觸發密碼重設信（對不存在的 Email 靜默成功，避免枚舉）。
   * 注意（KB-012）：免費方案未設定自訂 SMTP 前 Email 樣板無法自訂，重設信
   * 走 Supabase 預設樣板＋implicit recovery flow；實際更新密碼在瀏覽器端
   * 完成（src/lib/supabase-browser.ts＋reset-password 頁面），不透過本 adapter。
   */
  sendPasswordReset(email: string, resetRedirectTo: string): Promise<void>;

  /** 讀取使用者目前狀態（email 驗證與否等） */
  getUserById(userId: string): Promise<AuthUser | null>;

  /**
   * E1-F3：驗證 Google 登入（經 Supabase Auth OAuth 代理）核發的 access_token，
   * 回傳其代表的使用者身分。Token 無效／過期時回 "AUTH_GOOGLE_FAILED"（A123：
   * 不得建立半完成帳號，呼叫端據此直接中止，不寫入任何列）。
   */
  verifyGoogleToken(
    accessToken: string,
  ): Promise<{ userId: string; email: string; emailVerified: boolean } | "AUTH_GOOGLE_FAILED">;

  /**
   * E6-F1（C10）：永久刪除帳號時一併刪除外部 Auth 身分——僅刪本地 `users` 列
   * 不夠，帳密憑證仍存於 Supabase Auth，使用者仍能登入並經既有
   * `syncUserVerification()` upsert 邏輯讓 `users` 列復活，形同刪除未生效。
   */
  deleteUser(userId: string): Promise<void>;
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}
