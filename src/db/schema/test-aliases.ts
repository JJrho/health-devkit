import { index, pgTable, text, uuid } from "drizzle-orm/pg-core";
import { testDefinitions } from "./test-definitions";

/**
 * E2-F4 別名對應表（SDD §4.6；A40）。
 * 比對採精確字串比對（呼叫端先 trim），非模糊比對——
 * 寧可漏掉沒建別名的項目，也不要誤連不同項目（憲法 §3／SDD §4.6 精神）。
 */
export const testAliases = pgTable(
  "test_aliases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    testDefinitionId: uuid("test_definition_id")
      .notNull()
      .references(() => testDefinitions.id),
    aliasText: text("alias_text").notNull(),
  },
  (table) => [index("test_aliases_alias_text_idx").on(table.aliasText)],
);
