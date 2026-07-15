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

  seed(email: string, password: string, verified: boolean): string {
    const userId = randomUUID();
    this.accounts.set(email, { userId, password, verified });
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
});
