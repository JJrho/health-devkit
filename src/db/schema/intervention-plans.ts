import { pgTable, text, timestamp, uuid, index, integer, type AnyPgColumn } from "drizzle-orm/pg-core";
import { projects } from "./projects";

/**
 * E5-F1 健康行動計畫表（SDD §4.10；上游 §8／§17／§18.3／§19／§28.7；Part 1/2）。
 * 安全欄位（baseline／riskNote／stopCondition／referralCondition／reviewDate）
 * 皆 nullable——draft 階段允許不完整（Stage 8「autosave」精神），啟用前由
 * activatePlan() 結構化檢查是否齊全（A87：僅檢查欄位是否非空，不對內容做
 * 語意判讀）。status 落地上游 §18.3 狀態機子集（A85），safety_review 僅型別
 * 保留，本輪 activatePlan() 為同步檢查、不產生該狀態實際資料。
 * previousVersionId 本輪僅預留（A89），版本鏈邏輯留待 Part 2/2。
 */
export const interventionPlans = pgTable(
  "intervention_plans",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    title: text("title").notNull(),
    baseline: text("baseline"),
    riskNote: text("risk_note"),
    stopCondition: text("stop_condition"),
    referralCondition: text("referral_condition"),
    reviewDate: timestamp("review_date", { withTimezone: true }),
    status: text("status").notNull().default("draft"),
    stopReason: text("stop_reason"),
    previousVersionId: uuid("previous_version_id").references((): AnyPgColumn => interventionPlans.id),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("intervention_plans_project_id_idx").on(table.projectId)],
);
