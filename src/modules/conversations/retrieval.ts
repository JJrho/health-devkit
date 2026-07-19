import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { observations, testDefinitions } from "@/db/schema";
import { searchKnowledge, type KnowledgeChunkResult } from "@/modules/knowledge";

export interface ObservationContext {
  observationId: string;
  testName: string;
  value: string;
  unit: string;
  referenceRange: string | null;
  createdAt: Date;
}

export interface RetrievalContext {
  observations: ObservationContext[];
  knowledgeChunks: KnowledgeChunkResult[];
}

/**
 * E4-F3 檢索（技術選型 §11.4 的簡化版，A70）：
 * - 個人資料範圍（C16）：本輪取專案全部 status=active 的 observations（PoC 資料量小，
 *   暫不做「僅相關項目」的問題語意篩選——真正的相關性篩選需要另一層問題→測項的
 *   對應邏輯，非本輪 PoC 驗證引用機制所必需，token 預算暫以取回筆數上限近似）。
 * - 知識檢索：沿用 E4-F1 searchKnowledge()（trigram 子字串，僅 active 來源）。
 *   不含 getClaimsForTopic()（E4-F2）——questionText 到 topicKey 的自動對應需要
 *   額外分類邏輯，超出本輪範圍，衝突主張檢索留待後續迭代。
 */
export async function retrieveContext(projectId: string, questionText: string): Promise<RetrievalContext> {
  const obsRows = await getDb()
    .select({
      observationId: observations.id,
      testName: testDefinitions.canonicalName,
      value: observations.numericValue,
      unit: observations.unit,
      referenceRange: observations.rawReferenceRange,
      createdAt: observations.createdAt,
    })
    .from(observations)
    .innerJoin(testDefinitions, eq(observations.testDefinitionId, testDefinitions.id))
    .where(and(eq(observations.projectId, projectId), eq(observations.status, "active"), isNull(observations.deletedAt)))
    .orderBy(desc(observations.createdAt))
    .limit(50);

  const knowledgeChunks = await searchKnowledge(questionText);

  return {
    observations: obsRows.map((r) => ({ ...r, value: String(r.value) })),
    knowledgeChunks,
  };
}
