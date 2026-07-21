import { index, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

/**
 * E6-F1 稽核事件表（SDD §4.12；取代 A11 過渡期的 logger.warn-only 作法）。
 * userId 不設外鍵（A138）：稽核紀錄須在帳號被永久刪除後仍可查詢追溯，
 * 若設外鍵，帳號刪除時會被迫連動刪除或阻擋，違背稽核紀錄應獨立存續的精神。
 * metadata 僅容白名單結構化欄位（requestId/userId/projectId/path/method 等），
 * 憲法 §4：健康內容與金鑰永不入稽核紀錄。
 */
export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: uuid("user_id").notNull(),
    eventType: text("event_type").notNull(),
    metadata: jsonb("metadata").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_user_id_idx").on(table.userId),
    index("audit_events_event_type_idx").on(table.eventType),
  ],
);
