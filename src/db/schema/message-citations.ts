import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { messages } from "./messages";
import { observations } from "./observations";
import { knowledgeChunks } from "./knowledge-chunks";

/**
 * E4-F3 引用表（SDD §4.9；技術選型 §11.5）。
 * observationId／knowledgeChunkId 恰有一者非 null，由 citationType 判別
 * （應用層保證，非 DB constraint——比照專案既有慣例，複雜 CHECK 約束留在
 * 服務層驗證，見 KB-018 RLS 相關限制的既定務實取捨）。
 * citedText 為 LLM 實際引用的原文片段，供人工核對與未來語意驗證擴充。
 */
export const messageCitations = pgTable("message_citations", {
  id: uuid("id").primaryKey().defaultRandom(),
  messageId: uuid("message_id")
    .notNull()
    .references(() => messages.id),
  citationType: text("citation_type").notNull(),
  observationId: uuid("observation_id").references(() => observations.id),
  knowledgeChunkId: uuid("knowledge_chunk_id").references(() => knowledgeChunks.id),
  citedText: text("cited_text").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});
