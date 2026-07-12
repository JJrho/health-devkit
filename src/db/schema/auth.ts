import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * E1-F2 帳號生命週期資料表（SDD §4.1；C6–C9、C11）。
 * 型別規則依憲法 §4：timestamptz、integer version、soft delete（deleted_at）。
 * 密碼雜湊不落地——由 Supabase Auth 管理（A7/A9）。
 */

/** 應用層使用者——id 與 Supabase auth 使用者一對一 */
export const users = pgTable("users", {
  id: uuid("id").primaryKey(), // 來自 Supabase auth，不自產
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false), // C6 閘
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  deletedAt: timestamp("deleted_at", { withTimezone: true }), // 刪除鏈於 E6-F1（C10）
});

/** 應用層 session（A9：7 天滑動效期，C8）；cookie 只存原始 token，DB 只存雜湊 */
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    tokenHash: text("token_hash").notNull().unique(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    lastActiveAt: timestamp("last_active_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
  },
  (table) => [index("sessions_user_id_idx").on(table.userId)],
);

/**
 * 登入節流狀態（C7/A8）：每 email 一列。
 * 對不存在的帳號同樣記錄，避免由回應差異推測帳號存在性。
 */
export const loginAttempts = pgTable("login_attempts", {
  email: text("email").primaryKey(),
  failedCount: integer("failed_count").notNull().default(0),
  windowStartedAt: timestamp("window_started_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  lockedUntil: timestamp("locked_until", { withTimezone: true }),
  lockoutLevel: integer("lockout_level").notNull().default(0), // 累犯翻倍（C7）
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

/** 同意紀錄（C11/A10）：版本＋時間戳；正式條款換入時版本遞增 */
export const consentRecords = pgTable(
  "consent_records",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id),
    consentType: text("consent_type", {
      enum: ["terms-and-disclaimer", "age-18"],
    }).notNull(),
    version: text("version").notNull(),
    agreedAt: timestamp("agreed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("consent_records_user_id_idx").on(table.userId)],
);
