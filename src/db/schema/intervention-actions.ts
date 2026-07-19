import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { interventionPlans } from "./intervention-plans";

/**
 * E5-F1 行動表（SDD §4.10；上游 §8／§22.6；Part 1/2）。
 * category 採自由文字，不做 enum（A91：比照 health_profiles A16，上游未定案
 * 到可直接開 enum 的分類細緻度，過度正規化等於本輪自行擴權定案未決事項）。
 */
export const interventionActions = pgTable(
  "intervention_actions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => interventionPlans.id),
    description: text("description").notNull(),
    category: text("category"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("intervention_actions_plan_id_idx").on(table.planId)],
);
