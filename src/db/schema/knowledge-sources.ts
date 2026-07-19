import { pgTable, text, timestamp, integer, date, uuid } from "drizzle-orm/pg-core";

/**
 * E4-F1 知識來源表（SDD §4.8；上游 §13.1／§17）。
 * MVP 無管理 UI（C3），以 seed script＋DB 直接維護，審核者＝PO。
 * status 逐字對應上游 §17；searchKnowledge() 僅回傳 status='active' 來源的內容
 * （上游 §21.1「僅使用有效知識來源」）——真實但未經人工最終校對的內容
 * 一律先以 draft 入庫（A55），避免被提早引用。
 * 本輪不含 embedding／vector 欄位（A54，向量檢索留待 embedding provider 決定後補上）。
 */
export const knowledgeSources = pgTable("knowledge_sources", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  author: text("author"),
  sourceType: text("source_type").notNull(),
  url: text("url"),
  publishedDate: date("published_date"),
  status: text("status").notNull().default("draft"),
  version: integer("version").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});
