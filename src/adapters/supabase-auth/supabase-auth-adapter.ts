import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { AuthAdapter, AuthUser } from "../auth-adapter";

/**
 * AuthAdapter 的 Supabase 實作（A7/A9）。
 * - anon client：signUp／signInWithPassword／resetPasswordForEmail／verifyOtp
 * - admin client（service_role）：Email 既存檢查、依 id 讀使用者
 * 兩把金鑰皆來自環境變數，僅在本 adapter 使用（憲法 §1）。
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
  ): Promise<{ userId: string } | "EMAIL_EXISTS"> {
    // Supabase 對既存 Email 的 signUp 會回混淆結果（防枚舉），
    // 但 SDD §4.1 要求註冊側明確提示——以 admin API 先查。
    const existing = await this.findUserIdByEmail(email);
    if (existing) return "EMAIL_EXISTS";

    const { data, error } = await this.anon.auth.signUp({
      email,
      password,
      options: { emailRedirectTo: verifyRedirectTo },
    });
    if (error || !data.user) {
      throw new Error(`註冊失敗：${error?.code ?? "unknown"}`);
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
    const { data, error } = await this.anon.auth.verifyOtp({
      type: "recovery",
      token_hash: tokenHash,
    });
    if (error || !data.session) return false; // 逾時或已用（C9 由 Supabase 單次性＋後台效期設定保證）

    const { error: updateError } = await this.admin.auth.admin.updateUserById(
      data.session.user.id,
      { password: newPassword },
    );
    // 重設後撤銷該臨時 session
    await this.anon.auth.signOut({ scope: "local" });
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

  private async findUserIdByEmail(email: string): Promise<string | null> {
    // supabase-js v2 admin API 無 getUserByEmail；以分頁列舉過濾（使用者量大前夠用，
    // 屆時改用 GoTrue admin REST 的 email 過濾）
    const normalized = email.toLowerCase();
    let page = 1;
    for (;;) {
      const { data, error } = await this.admin.auth.admin.listUsers({
        page,
        perPage: 200,
      });
      if (error) throw new Error(`使用者查詢失敗：${error.code ?? "unknown"}`);
      const hit = data.users.find((u) => u.email?.toLowerCase() === normalized);
      if (hit) return hit.id;
      if (data.users.length < 200) return null;
      page += 1;
    }
  }
}
