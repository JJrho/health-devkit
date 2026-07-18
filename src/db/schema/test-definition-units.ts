import { numeric, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { testDefinitions } from "./test-definitions";

/**
 * E2-F4 單位換算白名單（SDD §4.6；憲法 §4 numeric 規則）。
 * factorToCanonical：乘法換算係數（canonicalValue = rawValue * factorToCanonical）。
 * 本輪只支援線性換算，不支援需要偏移量的單位（MVP 範圍內項目皆無此需求）。
 * unitText 不在白名單內即視為不可換算，不得建立 observation（不可猜測連線）。
 */
export const testDefinitionUnits = pgTable("test_definition_units", {
  id: uuid("id").primaryKey().defaultRandom(),
  testDefinitionId: uuid("test_definition_id")
    .notNull()
    .references(() => testDefinitions.id),
  unitText: text("unit_text").notNull(),
  factorToCanonical: numeric("factor_to_canonical").notNull(),
});
