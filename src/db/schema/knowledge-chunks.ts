import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { knowledgeSources } from "./knowledge-sources";

/**
 * E4-F1 知識來源切分內容表（SDD §4.8）。
 * 檢索採 ILIKE 子字串比對＋pg_trgm GIN 索引（A54 修正版，見 KB-029）：
 * 原規劃用 Postgres 內建 to_tsvector('simple', ...) 全文檢索，但實測發現
 * 對中文完全不斷詞——整段標點分隔的文字會變成單一詞元，查詢子字串（如
 * 「病人」）永遠比對不到。Postgres 標準文字搜尋設定檔（simple／english）
 * 皆無中文斷詞能力，需要額外的中文分詞擴充套件（如 zhparser，非 Supabase
 * 標準可用擴充），超出本輪範圍；改用 pg_trgm 的 trigram 索引加速 ILIKE
 * 子字串查詢，雖不具語意理解，但對中文內容誠實可用、不需額外擴充套件。
 * 本輪不含 embedding／vector 欄位（A54，向量檢索留待 embedding provider 決定後補上）。
 */
export const knowledgeChunks = pgTable(
  "knowledge_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id),
    chunkIndex: integer("chunk_index").notNull(),
    content: text("content").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("knowledge_chunks_source_id_idx").on(table.sourceId),
    index("knowledge_chunks_content_trgm_idx").using("gin", table.content.op("gin_trgm_ops")),
  ],
);
