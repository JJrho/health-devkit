import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { conversations } from "./conversations";

/**
 * E4-F3 訊息表（SDD §4.9；上游 §17／§18.2 逐字狀態機，A70）。
 * role=user 的訊息建立時即 status 無意義（不進狀態機，見服務層以固定值處理）；
 * role=assistant 的訊息依序經歷 queued → retrieving_sources → safety_check
 * → streaming → completed，或於任一階段轉 blocked／failed，streaming → cancelled。
 * errorCode 對應上游 §24（如 AI_INSUFFICIENT_DATA）。version 本輪僅預留給
 * PoC 2/2 的 regenerate 邏輯，本輪不實作多版本比對。
 */
export const messages = pgTable(
  "messages",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    conversationId: uuid("conversation_id")
      .notNull()
      .references(() => conversations.id),
    role: text("role").notNull(),
    content: text("content"),
    status: text("status").notNull(),
    errorCode: text("error_code"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("messages_conversation_id_idx").on(table.conversationId)],
);
