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
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}
