import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { interventionPlans } from "./intervention-plans";
import { trackingMetrics } from "./tracking-metrics";

/**
 * E5-F2 日常回報表（SDD §4.10；上游 §17／§22.6／§23）。
 * value 採自由文字，非強制 numeric（A103）——日常回報是使用者主觀記錄
 * （如疲勞程度、可持續程度），與 observations 的正式檢驗數值本質不同，
 * 憲法 §4「numeric」規則不適用於此。status 依上游 §17 逐字：
 * draft／submitted／corrected／deleted。
 */
export const checkIns = pgTable(
  "check_ins",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => interventionPlans.id),
    metricId: uuid("metric_id")
      .notNull()
      .references(() => trackingMetrics.id),
    value: text("value").notNull(),
    note: text("note"),
    checkinDate: timestamp("checkin_date", { withTimezone: true }).notNull(),
    status: text("status").notNull().default("submitted"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("check_ins_plan_id_idx").on(table.planId)],
);
