import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthAdapter, AuthUser } from "../auth-adapter";

/**
 * AuthAdapter 的 Supabase 實作（A7/A9；KB-009/KB-012）。
 *
 * 注意：本專案的 Supabase service_role 為新版不透明金鑰（sb_secret_...），
 * 該格式目前不被 GoTrue Admin API（auth.admin.*）接受（實測回 401 no_authorization）。
 * 因此註冊查重複一律改走官方文件記載、不依賴 Admin API 的標準流程：
 * signUp 對已存在 Email 回 identities:[]（防枚舉的官方判斷法）。
 * getUserById 目前未被任何 Feature 呼叫，暫留 Admin API 實作；真正要用時需另尋方案。
 *
 * 密碼重設不在本 adapter：免費方案未設定自訂 SMTP 無法自訂 Email 樣板，
 * 重設信一律走 Supabase 預設樣板＋implicit recovery flow，故改在瀏覽器端完成
 * （src/lib/supabase-browser.ts＋reset-password 頁面）。
 */
export class SupabaseAuthAdapter implements AuthAdapter {
  private readonly anon: SupabaseClient;
  private readonly admin: SupabaseClient;

  constructor(url: string, anonKey: string, serviceRoleKey: string) {
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    this.anon = createClient(url, anonKey, options);
    this.admin = createClient(url, serviceRoleKey, options);
  }

  async register(
    email: string,
    password: string,
    verifyRedirectTo: string,
  ): Promise<
    { userId: string } | "EMAIL_EXISTS" | "INVALID_EMAIL" | "EMAIL_RATE_LIMITED"
  > {
    const { data, error } = await this.anon.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: verifyRedirectTo },
    });
    if (error) {
      // 可預期的使用者輸入錯誤／限流：回結構化結果，不當例外處理
      if (error.code === "email_address_invalid" || error.code === "validation_failed") {
        return "INVALID_EMAIL";
      }
      // 免費方案信件寄送限流（A7 已知限制，非程式錯誤）
      if (error.code === "over_email_send_rate_limit") {
        return "EMAIL_RATE_LIMITED";
      }
      throw new Error(`註冊失敗：${error.code ?? "unknown"}`);
    }
    if (!data.user) throw new Error("註冊失敗：無使用者資料回傳");

    // Email 已存在時，Supabase 回傳成功但 identities 為空陣列（防枚舉設計）
    if (data.user.identities && data.user.identities.length === 0) {
      return "EMAIL_EXISTS";
    }
    return { userId: data.user.id };
  }

  async verifyPassword(
    email: string,
    password: string,
  ): Promise<{ userId: string; emailVerified: boolean } | null> {
    const { data, error } = await this.anon.auth.signInWithPassword({
      email,
      password,
    });
    if (error || !data.user) return null;
    // 只取驗證結果；Supabase 端 session 立即捨棄（A9：session 由應用層管理）
    await this.anon.auth.signOut({ scope: "local" });
    return {
      userId: data.user.id,
      emailVerified: Boolean(data.user.email_confirmed_at),
    };
  }

  async sendPasswordReset(email: string, resetRedirectTo: string): Promise<void> {
    // 對不存在的 Email，Supabase 本身即靜默成功——符合防枚舉要求
    await this.anon.auth.resetPasswordForEmail(email, {
      redirectTo: resetRedirectTo,
    });
  }

  async getUserById(userId: string): Promise<AuthUser | null> {
    const { data, error } = await this.admin.auth.admin.getUserById(userId);
    if (error || !data.user?.email) return null;
    return {
      id: data.user.id,
      email: data.user.email,
      emailVerified: Boolean(data.user.email_confirmed_at),
    };
  }

  /**
   * A124：驗證 Google 登入核發的 access_token 改用 anon.auth.getUser(token)
   * （帶使用者自己的 JWT 呼叫 /auth/v1/user），刻意不用 Admin API——本專案
   * service_role 為新版不透明金鑰格式，已知不被 Admin API 接受（見 getUserById
   * 註解與 KB-009／KB-012），anon 端點不受此限制，且為官方標準驗證流程。
   */
  async verifyGoogleToken(
    accessToken: string,
  ): Promise<{ userId: string; email: string; emailVerified: boolean } | "AUTH_GOOGLE_FAILED"> {
    const { data, error } = await this.anon.auth.getUser(accessToken);
    if (error || !data.user?.email) return "AUTH_GOOGLE_FAILED";
    return {
      userId: data.user.id,
      email: data.user.email,
      emailVerified: Boolean(data.user.email_confirmed_at),
    };
  }
}
