import { index, integer, jsonb, numeric, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";
import { extractedItems } from "./extracted-items";
import { projects } from "./projects";
import { testDefinitions } from "./test-definitions";

/**
 * E2-F4 正式檢驗紀錄表（SDD §4.6；上游 §17：由確認建立／新版本／軟刪除）。
 * 掛在 project 層級（非 document 層級，A43）——同一項目的版本鏈可能橫跨不同文件。
 * numericValue 為已換算 canonical 單位後的數值（憲法 §4「健康數值須用 numeric」，
 * 本輪首次真正落地）；rawValue／rawUnit 原樣保留（憲法 §4「原值永遠保留」）。
 * 編輯採「整列新增＋前版 superseded」的完整版本鏈（A42），非原地覆寫。
 */
export const observations = pgTable(
  "observations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    extractedItemId: uuid("extracted_item_id")
      .notNull()
      .references(() => extractedItems.id),
    testDefinitionId: uuid("test_definition_id")
      .notNull()
      .references(() => testDefinitions.id),
    numericValue: numeric("numeric_value").notNull(),
    unit: text("unit").notNull(),
    rawValue: text("raw_value").notNull(),
    rawUnit: text("raw_unit"),
    pageNumber: integer("page_number").notNull(),
    coordinates: jsonb("coordinates").notNull(),
    status: text("status").notNull().default("active"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("observations_project_id_idx").on(table.projectId),
    index("observations_extracted_item_id_idx").on(table.extractedItemId),
  ],
);
