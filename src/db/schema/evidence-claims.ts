import { boolean, date, index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { knowledgeChunks } from "./knowledge-chunks";
import { knowledgeSources } from "./knowledge-sources";

/**
 * E4-F2 醫學主張與衝突狀態表（SDD §4.8；上游 §13.2／§13.3）。
 * 欄位逐字對應上游 §13.2 十三項（population…withdrawn）。
 * topicKey 為新增分組欄位（A61），由 PO／seed 作者人工指定，用於將討論
 * 同一醫學問題的多筆主張分組以利衝突比對；本輪不做自動語意分群。
 * conflictStatus 為人工標記，非系統自動判定（A62）——醫學衝突判斷需要
 * 語意理解，規則式程式碼無法可靠判斷，勉強做一個看似能分類、實際不準確
 * 的演算法比誠實地人工標記風險更高。
 * chunkId 可為 null（A64）：並非每個主張都能精確對應到單一 chunk；
 * sourceId 為必填保底，確保「每個主張可追溯」的最低要求成立。
 * sourceVersion 為建立主張當下的來源 version 快照，非動態 join（A66）。
 */
export const evidenceClaims = pgTable(
  "evidence_claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sourceId: uuid("source_id")
      .notNull()
      .references(() => knowledgeSources.id),
    chunkId: uuid("chunk_id").references(() => knowledgeChunks.id),
    topicKey: text("topic_key").notNull(),
    population: text("population"),
    action: text("action"),
    dosage: text("dosage"),
    comparator: text("comparator"),
    outcome: text("outcome"),
    studyDirection: text("study_direction"),
    studyType: text("study_type"),
    applicableConditions: text("applicable_conditions"),
    risk: text("risk"),
    uncertainty: text("uncertainty"),
    publishedDate: date("published_date"),
    sourceVersion: integer("source_version").notNull(),
    withdrawn: boolean("withdrawn").notNull().default(false),
    conflictStatus: text("conflict_status"),
    conflictReason: text("conflict_reason"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("evidence_claims_topic_key_idx").on(table.topicKey),
    index("evidence_claims_source_id_idx").on(table.sourceId),
  ],
);
