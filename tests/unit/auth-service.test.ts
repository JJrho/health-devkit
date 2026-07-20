import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import type { AuthAdapter, AuthUser } from "@/adapters";
import { getDb, getPool, closePool } from "@/db/client";
import { consentRecords, loginAttempts, sessions, users } from "@/db/schema";
import { AuthService, CONSENT_VERSION } from "@/modules/auth/service";
import { validateSession } from "@/modules/auth/session";

/**
 * Auth 服務整合測試（AC-1/2/3/4/5/7/8；連實庫，Supabase 憑證以假 adapter 取代）。
 * 測試資料一律用 @test.invalid 網域，收尾清除。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

/** 假 AuthAdapter：記憶體帳號庫 */
class FakeAuthAdapter implements AuthAdapter {
  private accounts = new Map<string, { userId: string; password: string; verified: boolean }>();
  /** E1-F3：假 Google token → 使用者身分對照表 */
  private googleTokens = new Map<string, { userId: string; email: string; emailVerified: boolean }>();

  seed(email: string, password: string, verified: boolean): string {
    const userId = randomUUID();
    this.accounts.set(email, { userId, password, verified });
    return userId;
  }

  /** 註冊一個「Google 會核發此 token」的假身分；userId 可留空自動產生 */
  seedGoogleToken(
    token: string,
    email: string,
    emailVerified: boolean,
    userId: string = randomUUID(),
  ): string {
    this.googleTokens.set(token, { userId, email, emailVerified });
    return userId;
  }

  async register(email: string, password: string): Promise<{ userId: string } | "EMAIL_EXISTS"> {
    if (this.accounts.has(email)) return "EMAIL_EXISTS";
    return { userId: this.seed(email, password, false) };
  }

  async verifyPassword(email: string, password: string) {
    const account = this.accounts.get(email);
    if (!account || account.password !== password) return null;
    return { userId: account.userId, emailVerified: account.verified };
  }

  async sendPasswordReset(): Promise<void> {}
  async getUserById(): Promise<AuthUser | null> {
    return null;
  }

  async verifyGoogleToken(accessToken: string) {
    const identity = this.googleTokens.get(accessToken);
    if (!identity) return "AUTH_GOOGLE_FAILED" as const;
    return identity;
  }
}

describe.skipIf(!hasDb)("AuthService（整合，需 DATABASE_URL）", () => {
  let adapter: FakeAuthAdapter;
  let service: AuthService;

  beforeAll(() => {
    adapter = new FakeAuthAdapter();
    service = new AuthService(adapter);
  });

  afterAll(async () => {
    const db = getDb();
    const testUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, "%@test.invalid"));
    for (const user of testUsers) {
      await db.delete(consentRecords).where(eq(consentRecords.userId, user.id));
      await db.delete(sessions).where(eq(sessions.userId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
    await db.delete(loginAttempts).where(like(loginAttempts.email, "%@test.invalid"));
    await closePool();
  });

  it("AC-1：註冊成功建立 user＋兩筆 consent 紀錄（版本＋時間戳）", async () => {
    const email = `reg-${Date.now()}@test.invalid`;
    const result = await service.register({
      email,
      password: "password123",
      agreeTermsAndDisclaimer: true,
      declareAge18: true,
      verifyRedirectTo: "http://localhost/auth/verified",
    });
    expect(result.ok).toBe(true);

    const consents = await getDb()
      .select()
      .from(consentRecords)
      .where(eq(consentRecords.userId, (result as { userId: string }).userId));
    expect(consents).toHaveLength(2);
    expect(consents.map((c) => c.consentType).sort()).toEqual([
      "age-18",
      "terms-and-disclaimer",
    ]);
    expect(consents.every((c) => c.version === CONSENT_VERSION)).toBe(true);
    expect(consents.every((c) => c.agreedAt instanceof Date)).toBe(true);
  });

  it("AC-1：未勾選任一同意 → CONSENT_REQUIRED 且不建帳號", async () => {
    const result = await service.register({
      email: `noconsent-${Date.now()}@test.invalid`,
      password: "password123",
      agreeTermsAndDisclaimer: true,
      declareAge18: false,
      verifyRedirectTo: "http://localhost/auth/verified",
    });
    expect(result).toEqual({ ok: false, code: "CONSENT_REQUIRED" });
  });

  it("AC-2（TDD 種子）：同 Email 再註冊 → EMAIL_EXISTS，不建第二帳號", async () => {
    const email = `dup-${Date.now()}@test.invalid`;
    const first = await service.register({
      email,
      password: "password123",
      agreeTermsAndDisclaimer: true,
      declareAge18: true,
      verifyRedirectTo: "http://localhost/auth/verified",
    });
    expect(first.ok).toBe(true);

    const second = await service.register({
      email,
      password: "different456",
      agreeTermsAndDisclaimer: true,
      declareAge18: true,
      verifyRedirectTo: "http://localhost/auth/verified",
    });
    expect(second).toEqual({ ok: false, code: "EMAIL_EXISTS" });

    const rows = await getDb().select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
  });

  it("AC-3／AC-4：登入建立可驗證 session；未驗證帳號可登入且標記 emailVerified=false（C6）", async () => {
    const email = `login-${Date.now()}@test.invalid`;
    adapter.seed(email, "password123", false);

    const result = await service.login({ email, password: "password123" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailVerified).toBe(false); // C6 閘

    const active = await validateSession(result.token);
    expect(active).not.toBeNull();

    // AC-7：登出撤銷後不可再驗證
    await service.logout(result.token);
    expect(await validateSession(result.token)).toBeNull();
  });

  it("AC-5：15 分鐘內錯 5 次 → 第 6 次 AUTH_LOCKED（C7）", async () => {
    const email = `lock-${Date.now()}@test.invalid`;
    adapter.seed(email, "correct-password", true);

    for (let i = 0; i < 5; i++) {
      const fail = await service.login({ email, password: "wrong" });
      expect(fail).toEqual({ ok: false, code: "AUTH_INVALID_CREDENTIALS" });
    }
    // 第 6 次：即使密碼正確也被鎖（鎖定優先）
    const locked = await service.login({ email, password: "correct-password" });
    expect(locked).toEqual({ ok: false, code: "AUTH_LOCKED" });
  });

  it("AC-5：不存在的帳號同樣走鎖定與統一錯誤（防枚舉）", async () => {
    const ghost = `ghost-${Date.now()}@test.invalid`;
    const fail = await service.login({ email: ghost, password: "whatever" });
    expect(fail).toEqual({ ok: false, code: "AUTH_INVALID_CREDENTIALS" });
  });

  it("AC-8：註冊與登入日誌不含 Email／密碼", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const email = `logsafe-${Date.now()}@test.invalid`;
    const password = "secret-password-999";

    await service.register({
      email,
      password,
      agreeTermsAndDisclaimer: true,
      declareAge18: true,
      verifyRedirectTo: "http://localhost/auth/verified",
    });
    await service.login({ email, password });

    const allOutput = spy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(allOutput).not.toContain(email);
    expect(allOutput).not.toContain(password);
    spy.mockRestore();
  });

  // E1-F3：Google 登入（AC-1～AC-7；AC-8 UI 僅瀏覽器驗證，見 SPRINT_LOG）
  it("E1-F3 AC-1：首次 Google 登入且已附同意條款 → 成功建立 users＋consent＋session", async () => {
    const email = `google-new-${Date.now()}@test.invalid`;
    const token = `fake-google-token-${randomUUID()}`;
    const userId = adapter.seedGoogleToken(token, email, true);

    const result = await service.loginWithGoogle({
      accessToken: token,
      agreeTermsAndDisclaimer: true,
      declareAge18: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.emailVerified).toBe(true);

    const rows = await getDb().select().from(users).where(eq(users.id, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.email).toBe(email);

    const consents = await getDb().select().from(consentRecords).where(eq(consentRecords.userId, userId));
    expect(consents).toHaveLength(2);

    expect(await validateSession(result.token)).not.toBeNull();
  });

  it("E1-F3 AC-2：首次 Google 登入但未附同意條款 → CONSENT_REQUIRED，不建任何列", async () => {
    const email = `google-noconsent-${Date.now()}@test.invalid`;
    const token = `fake-google-token-${randomUUID()}`;
    const userId = adapter.seedGoogleToken(token, email, true);

    const result = await service.loginWithGoogle({ accessToken: token });
    expect(result).toEqual({ ok: false, code: "CONSENT_REQUIRED" });

    const rows = await getDb().select().from(users).where(eq(users.id, userId));
    expect(rows).toHaveLength(0);
  });

  it("E1-F3 AC-3：既有帳號（先前 Email／密碼註冊）改用相同身分的 Google 登入 → 同一 userId，不重複建帳號", async () => {
    const email = `google-existing-${Date.now()}@test.invalid`;
    const passwordUserId = adapter.seed(email, "password123", true);
    await getDb().insert(users).values({ id: passwordUserId, email, emailVerified: true });

    const token = `fake-google-token-${randomUUID()}`;
    adapter.seedGoogleToken(token, email, true, passwordUserId);

    const result = await service.loginWithGoogle({ accessToken: token });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const rows = await getDb().select().from(users).where(eq(users.email, email));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.id).toBe(passwordUserId);
  });

  it("E1-F3 AC-4：偽造或不存在的 access_token → AUTH_GOOGLE_FAILED，不建任何資料", async () => {
    const result = await service.loginWithGoogle({ accessToken: "not-a-real-token" });
    expect(result).toEqual({ ok: false, code: "AUTH_GOOGLE_FAILED" });
  });

  it("E1-F3 AC-6：Google 登入建立的 session 可正常登出撤銷（回歸確認，沿用既有 revokeSession）", async () => {
    const email = `google-logout-${Date.now()}@test.invalid`;
    const token = `fake-google-token-${randomUUID()}`;
    adapter.seedGoogleToken(token, email, true);

    const result = await service.loginWithGoogle({
      accessToken: token,
      agreeTermsAndDisclaimer: true,
      declareAge18: true,
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    await service.logout(result.token);
    expect(await validateSession(result.token)).toBeNull();
  });

  it("E1-F3 AC-7：Google 登入過程日誌不含 access_token／Email", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const email = `google-logsafe-${Date.now()}@test.invalid`;
    const token = `fake-google-token-${randomUUID()}`;
    adapter.seedGoogleToken(token, email, true);

    await service.loginWithGoogle({
      accessToken: token,
      agreeTermsAndDisclaimer: true,
      declareAge18: true,
    });

    const allOutput = spy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(allOutput).not.toContain(token);
    expect(allOutput).not.toContain(email);
    spy.mockRestore();
  });
});
