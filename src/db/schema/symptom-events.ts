import { boolean, index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { interventionPlans } from "./intervention-plans";

/**
 * E5-F2 症狀事件表（SDD §4.10；上游 §17／§22.6／§23；不良反應暫停鏈核心）。
 * isAdverseEvent 完全由使用者手動標記，系統不對 description 做語意分析
 * 自動判定是否構成不良反應（A105）——設為 true 時服務層立即呼叫既有
 * stopPlan(planId, "adverse_event")（A90 預留介面）。status 依上游 §17
 * 逐字：open／monitoring／resolved／escalated。本輪不提供 DELETE（A107），
 * 症狀事件視為醫療相關歷程記錄，只能用 PATCH 補充或轉換狀態。
 */
export const symptomEvents = pgTable(
  "symptom_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => interventionPlans.id),
    description: text("description").notNull(),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    isAdverseEvent: boolean("is_adverse_event").notNull().default(false),
    status: text("status").notNull().default("open"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("symptom_events_plan_id_idx").on(table.planId)],
);
