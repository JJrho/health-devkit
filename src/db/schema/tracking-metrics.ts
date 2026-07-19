import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { interventionPlans } from "./intervention-plans";

/**
 * E5-F1 指標表（SDD §4.10；上游 §8.1／§22.6；Part 1/2）。
 * category 採 enum（leading／outcome／safety，上游 §8.1 逐字三分類），與
 * intervention_actions.category 的自由文字設計不同（A92）——本欄位是
 * activatePlan() 安全審查（A87）的判斷依據，需要程式邏輯可靠識別，
 * 不能是自由文字。
 */
export const trackingMetrics = pgTable(
  "tracking_metrics",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => interventionPlans.id),
    category: text("category").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("tracking_metrics_plan_id_idx").on(table.planId)],
);
