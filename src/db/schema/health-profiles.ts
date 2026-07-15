import { integer, jsonb, pgTable, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

/**
 * E1-F5 個人健康背景表（SDD §4.3；上游 §11.1／§12.2）。
 * 每專案一筆（unique project_id）——存取控制完全交給 projects 的四層鏈，
 * 不設自己的 deleted_at（生命週期跟隨專案，見 sprints/sprint-05-dor.md §1）。
 * data 用 jsonb 承接上游 §11.1／§12.2 欄位：欄位分類法上游未定案到可直接開
 * column 的細緻度，過度正規化等於本輪自行擴權定案未決事項（A16）。
 */
export const healthProfiles = pgTable(
  "health_profiles",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    data: jsonb("data").notNull().default({}),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [uniqueIndex("health_profiles_project_id_unique").on(table.projectId)],
);
