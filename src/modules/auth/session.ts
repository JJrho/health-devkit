import { createHash, randomBytes } from "crypto";
import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { sessions } from "@/db/schema";

/**
 * 應用層 session（C8/A9）：7 天滑動效期、HttpOnly cookie。
 * cookie 持原始 token；DB 只存 SHA-256 雜湊（外洩 DB 不等於外洩 session）。
 */
export const SESSION_CONFIG = {
  ttlMs: 7 * 24 * 60 * 60 * 1000, // 7 天（設定值）
  /** 距上次延展超過此間隔才寫 DB，避免每請求皆寫 */
  slideThresholdMs: 60 * 60 * 1000,
  cookieName: "hd_session",
} as const;

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

export async function createSession(userId: string): Promise<{
  token: string;
  expiresAt: Date;
}> {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_CONFIG.ttlMs);
  await getDb().insert(sessions).values({
    userId,
    tokenHash: hashToken(token),
    expiresAt,
  });
  return { token, expiresAt };
}

export interface ActiveSession {
  sessionId: string;
  userId: string;
  /** 若本次觸發滑動延展，帶回新效期（呼叫端需同步展延 cookie） */
  slidExpiresAt: Date | null;
}

/** 驗證＋滑動延展（C8：活動即延展 7 天） */
export async function validateSession(token: string): Promise<ActiveSession | null> {
  const db = getDb();
  const now = new Date();
  const rows = await db
    .select()
    .from(sessions)
    .where(and(eq(sessions.tokenHash, hashToken(token)), isNull(sessions.revokedAt)))
    .limit(1);

  const session = rows[0];
  if (!session || session.expiresAt <= now) return null;

  let slidExpiresAt: Date | null = null;
  const sinceActive = now.getTime() - session.lastActiveAt.getTime();
  if (sinceActive > SESSION_CONFIG.slideThresholdMs) {
    slidExpiresAt = new Date(now.getTime() + SESSION_CONFIG.ttlMs);
    await db
      .update(sessions)
      .set({ lastActiveAt: now, expiresAt: slidExpiresAt })
      .where(eq(sessions.id, session.id));
  }

  return { sessionId: session.id, userId: session.userId, slidExpiresAt };
}

export async function revokeSession(token: string): Promise<void> {
  await getDb()
    .update(sessions)
    .set({ revokedAt: new Date() })
    .where(eq(sessions.tokenHash, hashToken(token)));
}
