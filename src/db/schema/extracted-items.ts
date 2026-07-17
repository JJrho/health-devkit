import { index, integer, jsonb, pgTable, real, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents";

/**
 * E2-F2 辨識候選項表（SDD §4.5；上游 §18.1／§28.4；C14）。
 * 候選列，非正式紀錄——raw* 欄位一律 text（憲法 §4「健康數值須用 numeric」
 * 適用於已確認的正式紀錄，本表是未確認候選，故原樣保留文字，不預先轉型別）。
 * status 本輪僅寫入 extracted／low_confidence；edited/accepted/rejected 屬 E2-F3。
 * 無 deleted_at——reprocess 時整批硬刪重建，尚未進入正式刪除鏈語意。
 */
export const extractedItems = pgTable(
  "extracted_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id),
    rawTestName: text("raw_test_name").notNull(),
    rawValue: text("raw_value").notNull(),
    rawUnit: text("raw_unit"),
    rawReferenceRange: text("raw_reference_range"),
    confidence: real("confidence").notNull(),
    pageNumber: integer("page_number").notNull(),
    coordinates: jsonb("coordinates").notNull(), // {x, y, width, height}（憲法 §4 jsonb 座標規則）
    status: text("status").notNull().default("extracted"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("extracted_items_document_id_idx").on(table.documentId)],
);
