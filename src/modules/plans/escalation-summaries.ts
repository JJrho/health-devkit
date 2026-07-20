import { and, desc, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { escalationSummaries, planReviews, symptomEvents } from "@/db/schema";
import { findOwnedPlan, type PlanRow } from "./access";
import type { EscalationSummaryRow, PlanReviewRow } from "./service";

type AccessErrorCode = "PROJECT_ACCESS_DENIED" | "NOT_FOUND";

const SUMMARY_STATUSES = new Set(["draft", "ready", "exported", "deleted"]);

export type CreateEscalationSummaryResult =
  | { ok: true; id: string }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" };
export type EscalationSummaryMutationResult =
  | { ok: true; summary: EscalationSummaryRow }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" };
export type DeleteEscalationSummaryResult = { ok: true } | { ok: false; code: AccessErrorCode };

/** A118：純程式邏輯聚合既有資料，不經 LLM 生成，避免幻覺風險交給醫療專業人員審閱時出錯。 */
function buildSummaryContent(plan: PlanRow, review: PlanReviewRow, adverseEventCount: number): string {
  return [
    `計畫：${plan.title}`,
    `基準：${plan.baseline ?? "未填寫"}`,
    `風險：${plan.riskNote ?? "未填寫"}`,
    `停止條件：${plan.stopCondition ?? "未填寫"}`,
    `轉介條件：${plan.referralCondition ?? "未填寫"}`,
    `最近一次檢討分類：需要專業評估`,
    `檢討備註：${review.notes ?? "（無）"}`,
    `檢討時間：${review.reviewedAt?.toISOString() ?? "未知"}`,
    `近期不良反應症狀事件數：${adverseEventCount}`,
  ].join("\n");
}

/** A119：僅在計畫已有 classification=needs_professional_evaluation 的檢討時可產生，確保摘要有真實檢討依據可回溯。 */
export async function createEscalationSummary(
  userId: string,
  projectId: string,
  planId: string,
): Promise<CreateEscalationSummaryResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  const db = getDb();
  const [latestReview] = await db
    .select()
    .from(planReviews)
    .where(
      and(eq(planReviews.planId, found.plan.id), eq(planReviews.classification, "needs_professional_evaluation")),
    )
    .orderBy(desc(planReviews.reviewedAt))
    .limit(1);
  if (!latestReview) return { ok: false, code: "INVALID_REQUEST" };

  const adverseEvents = await db
    .select()
    .from(symptomEvents)
    .where(and(eq(symptomEvents.planId, found.plan.id), eq(symptomEvents.isAdverseEvent, true)));

  const content = buildSummaryContent(found.plan, latestReview, adverseEvents.length);
  const [row] = await db
    .insert(escalationSummaries)
    .values({ planId: found.plan.id, status: "draft", content })
    .returning();
  return { ok: true, id: row!.id };
}

/** 上游 §17「更新範圍」：本輪以狀態轉換呈現（draft→ready→exported），內容於產生時已聚合完畢。 */
export async function updateEscalationSummary(
  userId: string,
  projectId: string,
  planId: string,
  summaryId: string,
  input: { status: string },
): Promise<EscalationSummaryMutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (!SUMMARY_STATUSES.has(input.status)) return { ok: false, code: "INVALID_REQUEST" };

  const rows = await getDb()
    .update(escalationSummaries)
    .set({ status: input.status, updatedAt: new Date() })
    .where(and(eq(escalationSummaries.id, summaryId), eq(escalationSummaries.planId, found.plan.id)))
    .returning();
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, summary: rows[0] };
}

export async function deleteEscalationSummary(
  userId: string,
  projectId: string,
  planId: string,
  summaryId: string,
): Promise<DeleteEscalationSummaryResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  const rows = await getDb()
    .update(escalationSummaries)
    .set({ status: "deleted", updatedAt: new Date() })
    .where(and(eq(escalationSummaries.id, summaryId), eq(escalationSummaries.planId, found.plan.id)))
    .returning();
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true };
}
