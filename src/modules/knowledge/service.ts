import { and, eq, ilike } from "drizzle-orm";
import { getDb } from "@/db/client";
import { knowledgeChunks, knowledgeSources } from "@/db/schema";

export interface KnowledgeChunkResult {
  chunkId: string;
  sourceId: string;
  sourceTitle: string;
  content: string;
}

/**
 * E4-F1（SDD §4.8；上游 §21.1「僅使用有效知識來源」）：
 * 檢索僅回傳 status='active' 來源底下的 chunk；draft／processing／
 * inactive／withdrawn／failed 一律排除，確保未經最終確認的內容
 * （如 A55 的真實試點章節，seed 時為 draft）不會被提早引用。
 *
 * 採 ILIKE 子字串比對＋pg_trgm GIN 索引，非 Postgres 內建 tsvector 全文
 * 檢索（KB-029：實測發現 to_tsvector('simple', ...) 對中文不斷詞，查詢
 * 子字串完全比對不到，改用 trigram 索引）。純服務層函式，本輪無 API
 * 路由（無消費者，A58）。
 */
export async function searchKnowledge(query: string): Promise<KnowledgeChunkResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  // 逸出 ILIKE 萬用字元，避免使用者輸入的 % 或 _ 被誤當作查詢萬用字元
  const escaped = trimmed.replace(/[%_\\]/g, (char) => `\\${char}`);

  const rows = await getDb()
    .select({
      chunkId: knowledgeChunks.id,
      sourceId: knowledgeSources.id,
      sourceTitle: knowledgeSources.title,
      content: knowledgeChunks.content,
    })
    .from(knowledgeChunks)
    .innerJoin(knowledgeSources, eq(knowledgeChunks.sourceId, knowledgeSources.id))
    .where(and(eq(knowledgeSources.status, "active"), ilike(knowledgeChunks.content, `%${escaped}%`)));

  return rows;
}
