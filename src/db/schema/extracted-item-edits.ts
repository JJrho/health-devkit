import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { extractedItems } from "./extracted-items";

/**
 * E2-F3 異動歷史表（append-only；SDD §4.5；上游 §28.4「確認後有版本紀錄」；A36）。
 * 每次編輯 extracted_items 前，先把編輯前的欄位值寫入本表，本體才更新——
 * 落實憲法 §4「Original values … MUST be preserved forever」，而非原地覆寫。
 * 純接受／拒絕（無欄位變更）不寫入本表，只有實際內容編輯才記錄。
 */
export const extractedItemEdits = pgTable(
  "extracted_item_edits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    extractedItemId: uuid("extracted_item_id")
      .notNull()
      .references(() => extractedItems.id),
    previousRawTestName: text("previous_raw_test_name").notNull(),
    previousRawValue: text("previous_raw_value").notNull(),
    previousRawUnit: text("previous_raw_unit"),
    previousRawReferenceRange: text("previous_raw_reference_range"),
    editedAt: timestamp("edited_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("extracted_item_edits_extracted_item_id_idx").on(table.extractedItemId)],
);
