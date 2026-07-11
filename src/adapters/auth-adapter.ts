/**
 * AuthAdapter 介面（憲法 §1）。
 * Sprint 1 僅定義介面；Supabase Auth 實作於 E1-F2（帳號生命週期）。
 * 介面形狀以 SDD §4.1 所需能力為準，屆時依 Feature 需求演進（走規格，不預先實作）。
 */
export interface AuthAdapter {
  /** 以既有 session token 取回目前使用者；無效回 null */
  getUser(sessionToken: string): Promise<AuthUser | null>;
}

export interface AuthUser {
  id: string;
  email: string;
  emailVerified: boolean;
}
