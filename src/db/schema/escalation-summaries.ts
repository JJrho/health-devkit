import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { interventionPlans } from "./intervention-plans";

/**
 * E5-F3 專業轉介摘要表（SDD §4.11；上游 §17／§22.6／§23）。
 * content 由伺服器端純程式邏輯聚合既有資料組裝，不經 LLM 生成（A118，
 * 避免幻覺風險交給醫療專業人員審閱時出錯）。status 依上游 §17 逐字：
 * draft／ready／exported／deleted，刪除為狀態轉換而非 deletedAt 欄位。
 */
export const escalationSummaries = pgTable(
  "escalation_summaries",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => interventionPlans.id),
    status: text("status").notNull().default("draft"),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("escalation_summaries_plan_id_idx").on(table.planId)],
);
