import { pgTable, text, uuid } from "drizzle-orm/pg-core";

/**
 * E2-F4 標準化項目定義表（SDD §4.6；上游 §17／§23）。
 * canonicalUnit 是該項目換算後統一儲存的單位（供 observations.unit 使用）。
 * 本輪僅 seed 少量已知項目（A41），非完整醫學術語庫。
 */
export const testDefinitions = pgTable("test_definitions", {
  id: uuid("id").primaryKey().defaultRandom(),
  canonicalName: text("canonical_name").notNull(),
  canonicalUnit: text("canonical_unit").notNull(),
});
