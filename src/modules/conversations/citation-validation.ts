import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { knowledgeChunks, knowledgeSources, observations } from "@/db/schema";

const CITATION_TAG = /\[(OBS|SRC):([0-9a-fA-F-]{36})\]/g;

export interface ValidatedCitation {
  citationType: "observation" | "knowledge_chunk";
  observationId?: string;
  knowledgeChunkId?: string;
  citedText: string;
}

export interface CitationValidationResult {
  cleanedContent: string;
  citations: ValidatedCitation[];
}

/**
 * E4-F3 引用驗證（技術選型 §11.5；A74，PoC 範圍限定為結構性檢查）：
 * 逐一比對回答中出現的 [OBS:id]／[SRC:id] 標籤——
 * 1. 該 id 必須是本輪實際提供給模型的 context id（未被虛構）
 * 2. 查資料庫確認資料確實存在、屬於本專案（observation）或來源為 active（chunk）、未被刪除
 * 通過才保留在回答中並記入 message_citations；未通過者從回答文字中移除（絕不留下
 * 指向不存在或不合法資料的引用標籤）。「claim 與引用段落一致」簡化為 ID 未虛構，
 * 不做語意層面核對（見 DOR A74 說明）。
 */
export async function validateAndExtractCitations(
  content: string,
  projectId: string,
  providedObservationIds: ReadonlySet<string>,
  providedChunkIds: ReadonlySet<string>,
): Promise<CitationValidationResult> {
  const citations: ValidatedCitation[] = [];
  const matches = [...content.matchAll(CITATION_TAG)];
  let cleanedContent = content;

  for (const match of matches) {
    const fullTag = match[0];
    const kind = match[1] as "OBS" | "SRC";
    const id = match[2] as string;
    if (kind === "OBS") {
      if (!providedObservationIds.has(id)) {
        cleanedContent = cleanedContent.replaceAll(fullTag, "");
        continue;
      }
      const rows = await getDb()
        .select()
        .from(observations)
        .where(
          and(eq(observations.id, id), eq(observations.projectId, projectId), isNull(observations.deletedAt)),
        )
        .limit(1);
      const obs = rows[0];
      if (!obs) {
        cleanedContent = cleanedContent.replaceAll(fullTag, "");
        continue;
      }
      citations.push({
        citationType: "observation",
        observationId: obs.id,
        citedText: `${obs.rawValue} ${obs.unit}`,
      });
    } else {
      if (!providedChunkIds.has(id)) {
        cleanedContent = cleanedContent.replaceAll(fullTag, "");
        continue;
      }
      const rows = await getDb()
        .select({ chunk: knowledgeChunks, sourceStatus: knowledgeSources.status })
        .from(knowledgeChunks)
        .innerJoin(knowledgeSources, eq(knowledgeChunks.sourceId, knowledgeSources.id))
        .where(eq(knowledgeChunks.id, id))
        .limit(1);
      const row = rows[0];
      if (!row || row.sourceStatus !== "active") {
        cleanedContent = cleanedContent.replaceAll(fullTag, "");
        continue;
      }
      citations.push({
        citationType: "knowledge_chunk",
        knowledgeChunkId: row.chunk.id,
        citedText: row.chunk.content,
      });
    }
  }

  return { cleanedContent, citations };
}
