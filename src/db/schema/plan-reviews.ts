import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { interventionPlans } from "./intervention-plans";

/**
 * E5-F3 定期檢討表（SDD §4.11；上游 §9.3／§17／§22.6／§23）。
 * classification 為十分類白名單（A114，服務層驗證，非 DB enum），`completed`
 * 後不可再 PATCH（上游 §17「不覆寫」，A112）。status 依上游 §17 逐字：
 * pending／in_review／completed；本輪 createReview() 直接建立為 in_review
 * （A113：不落地 review_due 狀態，改用計算式判斷是否達檢討日）。
 */
export const planReviews = pgTable(
  "plan_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    planId: uuid("plan_id")
      .notNull()
      .references(() => interventionPlans.id),
    status: text("status").notNull().default("pending"),
    classification: text("classification"),
    notes: text("notes"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("plan_reviews_plan_id_idx").on(table.planId)],
);
