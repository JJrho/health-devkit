import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { evidenceClaims, knowledgeSources } from "@/db/schema";

/** 上游 §13.3 衝突狀態七分類逐字對應（A62：人工標記，非系統自動判定）。 */
export const CONFLICT_STATUSES = [
  "consistent",
  "different_conditions",
  "mixed_evidence",
  "insufficient_evidence",
  "not_applicable",
  "source_outdated",
  "source_withdrawn",
] as const;

export type ConflictStatus = (typeof CONFLICT_STATUSES)[number];

export interface EvidenceClaimResult {
  claimId: string;
  sourceId: string;
  sourceTitle: string;
  topicKey: string;
  population: string | null;
  action: string | null;
  dosage: string | null;
  comparator: string | null;
  outcome: string | null;
  studyDirection: string | null;
  studyType: string | null;
  applicableConditions: string | null;
  risk: string | null;
  uncertainty: string | null;
  publishedDate: string | null;
  sourceVersion: number;
  withdrawn: boolean;
  conflictStatus: string | null;
  conflictReason: string | null;
}

/**
 * E4-F2（SDD §4.8；上游 Stage 7「每個主張可追溯」／「來源撤回後不得供新
 * 內容」延伸至主張層）：依 topicKey 取得同主題所有主張，只回傳來源
 * status='active' 的主張——比照 searchKnowledge()（E4-F1）安全閘門，
 * draft／processing／inactive／withdrawn／failed 來源底下的主張一律排除。
 * 純服務層函式，本輪無 API 路由（無消費者，A67）。
 */
export async function getClaimsForTopic(topicKey: string): Promise<EvidenceClaimResult[]> {
  const trimmed = topicKey.trim();
  if (!trimmed) return [];

  const rows = await getDb()
    .select({
      claimId: evidenceClaims.id,
      sourceId: knowledgeSources.id,
      sourceTitle: knowledgeSources.title,
      topicKey: evidenceClaims.topicKey,
      population: evidenceClaims.population,
      action: evidenceClaims.action,
      dosage: evidenceClaims.dosage,
      comparator: evidenceClaims.comparator,
      outcome: evidenceClaims.outcome,
      studyDirection: evidenceClaims.studyDirection,
      studyType: evidenceClaims.studyType,
      applicableConditions: evidenceClaims.applicableConditions,
      risk: evidenceClaims.risk,
      uncertainty: evidenceClaims.uncertainty,
      publishedDate: evidenceClaims.publishedDate,
      sourceVersion: evidenceClaims.sourceVersion,
      withdrawn: evidenceClaims.withdrawn,
      conflictStatus: evidenceClaims.conflictStatus,
      conflictReason: evidenceClaims.conflictReason,
    })
    .from(evidenceClaims)
    .innerJoin(knowledgeSources, eq(evidenceClaims.sourceId, knowledgeSources.id))
    .where(and(eq(evidenceClaims.topicKey, trimmed), eq(knowledgeSources.status, "active")));

  return rows;
}
