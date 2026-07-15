import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthAdapter, AuthUser } from "../auth-adapter";

/**
 * AuthAdapter 的 Supabase 實作（A7/A9）。
 *
 * 注意：本專案的 Supabase service_role 為新版不透明金鑰（sb_secret_...），
 * 該格式目前不被 GoTrue Admin API（auth.admin.*）接受（實測回 401 no_authorization）。
 * 因此註冊查重複與密碼重設一律改走官方文件記載、不依賴 Admin API 的標準流程：
 * - 註冊查重複：signUp 對已存在 Email 回 identities:[]（防枚舉的官方判斷法）
 * - 密碼重設：verifyOtp 成功即取得 session，直接在同一 client 呼叫 updateUser
 * getUserById 目前未被任何 Feature 呼叫，暫留 Admin API 實作；真正要用時需另尋方案。
 */
export class SupabaseAuthAdapter implements AuthAdapter {
  private readonly url: string;
  private readonly anonKey: string;
  private readonly anon: SupabaseClient;
  private readonly admin: SupabaseClient;

  constructor(url: string, anonKey: string, serviceRoleKey: string) {
    const options = { auth: { persistSession: false, autoRefreshToken: false } };
    this.url = url;
    this.anonKey = anonKey;
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

  async resetPasswordWithToken(
    tokenHash: string,
    newPassword: string,
  ): Promise<boolean> {
    // 用請求範圍的獨立 client（非共用單例），避免併發請求互相污染 session 狀態
    const scoped = createClient(this.url, this.anonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data, error } = await scoped.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (error || !data.session) return false; // 逾時或已用（C9：Supabase 單次性＋後台效期設定保證）

    const { error: updateError } = await scoped.auth.updateUser({
      password: newPassword,
    });
    return !updateError;
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
}
