import { eq, sql } from "drizzle-orm";
import type { AuthAdapter } from "@/adapters";
import { getDb } from "@/db/client";
import { consentRecords, loginAttempts, users } from "@/db/schema";
import { logger } from "@/lib/logger";
import {
  INITIAL_THROTTLE,
  isLocked,
  onFailure,
  onSuccess,
  type ThrottleState,
} from "./lockout";
import { createSession, revokeSession } from "./session";

/** 佔位條款版本（A10）：正式文案經法律審查換入時遞增 */
export const CONSENT_VERSION = "0.1-placeholder-2026-07-12";

export type RegisterResult =
  | { ok: true; userId: string }
  | {
      ok: false;
      code:
        | "EMAIL_EXISTS"
        | "CONSENT_REQUIRED"
        | "WEAK_PASSWORD"
        | "INVALID_EMAIL"
        | "EMAIL_RATE_LIMITED";
    };

export type LoginResult =
  | { ok: true; token: string; expiresAt: Date; emailVerified: boolean }
  | { ok: false; code: "AUTH_LOCKED" | "AUTH_INVALID_CREDENTIALS" };

/**
 * Auth 領域服務（E1-F2）。
 * AuthAdapter 以建構子注入——測試用假實作，正式用 Supabase（憲法 §1）。
 */
export class AuthService {
  constructor(private readonly adapter: AuthAdapter) {}

  /** AC-1／AC-2：註冊含條款同意（C11）與既有帳號提示 */
  async register(input: {
    email: string;
    password: string;
    agreeTermsAndDisclaimer: boolean;
    declareAge18: boolean;
    verifyRedirectTo: string;
  }): Promise<RegisterResult> {
    if (!input.agreeTermsAndDisclaimer || !input.declareAge18) {
      return { ok: false, code: "CONSENT_REQUIRED" };
    }
    if (input.password.length < 8) {
      return { ok: false, code: "WEAK_PASSWORD" };
    }

    const email = input.email.trim().toLowerCase();
    const result = await this.adapter.register(
      email,
      input.password,
      input.verifyRedirectTo,
    );
    if (result === "EMAIL_EXISTS") return { ok: false, code: "EMAIL_EXISTS" };
    if (result === "INVALID_EMAIL") return { ok: false, code: "INVALID_EMAIL" };
    if (result === "EMAIL_RATE_LIMITED") return { ok: false, code: "EMAIL_RATE_LIMITED" };

    const db = getDb();
    await db.insert(users).values({ id: result.userId, email });
    await db.insert(consentRecords).values([
      {
        userId: result.userId,
        consentType: "terms-and-disclaimer",
        version: CONSENT_VERSION,
      },
      { userId: result.userId, consentType: "age-18", version: CONSENT_VERSION },
    ]);
    logger.info("使用者註冊", { status: "registered" }); // email 不入日誌（憲法 §4）
    return { ok: true, userId: result.userId };
  }

  /** AC-3／AC-4／AC-5：登入含鎖定（C7）、未驗證可登入（C6）、session（C8） */
  async login(input: { email: string; password: string }): Promise<LoginResult> {
    const email = input.email.trim().toLowerCase();
    const now = new Date();
    const throttle = await this.loadThrottle(email);

    if (isLocked(throttle, now)) {
      return { ok: false, code: "AUTH_LOCKED" };
    }

    const verified = await this.adapter.verifyPassword(email, input.password);
    if (!verified) {
      await this.saveThrottle(email, onFailure(throttle, now));
      // 不論帳號是否存在皆同一錯誤（防枚舉）
      return { ok: false, code: "AUTH_INVALID_CREDENTIALS" };
    }

    await this.saveThrottle(email, onSuccess(now));
    await this.syncUserVerification(verified.userId, email, verified.emailVerified);
    const session = await createSession(verified.userId);
    return {
      ok: true,
      token: session.token,
      expiresAt: session.expiresAt,
      emailVerified: verified.emailVerified,
    };
  }

  async logout(sessionToken: string): Promise<void> {
    await revokeSession(sessionToken);
  }

  /** AC-6（C9）：重設信；對不存在 Email 靜默成功 */
  async forgotPassword(email: string, resetRedirectTo: string): Promise<void> {
    await this.adapter.sendPasswordReset(email.trim().toLowerCase(), resetRedirectTo);
  }

  async resetPassword(tokenHash: string, newPassword: string): Promise<boolean> {
    if (newPassword.length < 8) return false;
    return this.adapter.resetPasswordWithToken(tokenHash, newPassword);
  }

  /** C6 閘：同步 email_verified 快照（登入與 me 時呼叫） */
  private async syncUserVerification(
    userId: string,
    email: string,
    emailVerified: boolean,
  ): Promise<void> {
    const db = getDb();
    await db
      .insert(users)
      .values({ id: userId, email, emailVerified })
      .onConflictDoUpdate({
        target: users.id,
        set: {
          emailVerified,
          updatedAt: new Date(),
          version: sql`${users.version} + 1`,
        },
      });
  }

  private async loadThrottle(email: string): Promise<ThrottleState> {
    const rows = await getDb()
      .select()
      .from(loginAttempts)
      .where(eq(loginAttempts.email, email))
      .limit(1);
    const row = rows[0];
    if (!row) return INITIAL_THROTTLE;
    return {
      failedCount: row.failedCount,
      windowStartedAt: row.windowStartedAt,
      lockedUntil: row.lockedUntil,
      lockoutLevel: row.lockoutLevel,
    };
  }

  private async saveThrottle(email: string, state: ThrottleState): Promise<void> {
    await getDb()
      .insert(loginAttempts)
      .values({
        email,
        failedCount: state.failedCount,
        windowStartedAt: state.windowStartedAt,
        lockedUntil: state.lockedUntil,
        lockoutLevel: state.lockoutLevel,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: loginAttempts.email,
        set: {
          failedCount: state.failedCount,
          windowStartedAt: state.windowStartedAt,
          lockedUntil: state.lockedUntil,
          lockoutLevel: state.lockoutLevel,
          updatedAt: new Date(),
        },
      });
  }
}
