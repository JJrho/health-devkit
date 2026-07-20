import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { interventionPlans, planReviews } from "@/db/schema";
import { findOwnedPlan } from "./access";
import { stopPlan, type PlanReviewRow } from "./service";

type AccessErrorCode = "PROJECT_ACCESS_DENIED" | "NOT_FOUND";

/** A114（核心安全設計）：十分類白名單，逐字採用上游 §9.3，UI 呈現為下拉選單而非自由文字。 */
export const REVIEW_CLASSIFICATIONS = [
  "improved",
  "partially_improved",
  "temporarily_stable",
  "not_due_yet",
  "insufficient_data",
  "data_not_comparable",
  "possibly_ineffective",
  "hard_to_sustain",
  "adverse_event",
  "needs_professional_evaluation",
] as const;
export type ReviewClassification = (typeof REVIEW_CLASSIFICATIONS)[number];

/** A117：僅計畫 active／paused 且已達 reviewDate 時可建立檢討。 */
const REVIEWABLE_STATUSES = new Set(["active", "paused"]);

export type CreateReviewResult =
  | { ok: true; id: string }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" };
export type CompleteReviewResult =
  | { ok: true; review: PlanReviewRow }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" };

/**
 * A113：不落地 review_due 狀態，改以計算式判斷（status ∈ {active, paused}
 * 且 reviewDate ≤ now）是否可建立檢討；建立時直接寫入 status=in_review
 * （本輪不使用 pending 這個中繼狀態）。同一計畫若已有進行中的檢討則拒絕重複建立。
 */
export async function createReview(
  userId: string,
  projectId: string,
  planId: string,
): Promise<CreateReviewResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  const plan = found.plan;
  if (!REVIEWABLE_STATUSES.has(plan.status)) return { ok: false, code: "INVALID_REQUEST" };
  if (!plan.reviewDate || plan.reviewDate.getTime() > Date.now()) {
    return { ok: false, code: "INVALID_REQUEST" };
  }

  const db = getDb();
  const [existing] = await db
    .select()
    .from(planReviews)
    .where(and(eq(planReviews.planId, plan.id), eq(planReviews.status, "in_review")))
    .limit(1);
  if (existing) return { ok: false, code: "INVALID_REQUEST" };

  const [row] = await db.insert(planReviews).values({ planId: plan.id, status: "in_review" }).returning();
  return { ok: true, id: row!.id };
}

/**
 * A114／A115（核心安全設計）：十分類結果最多觸發「狀態標記」——
 * 「計畫可能無效」→ ineffective；「需要專業評估」→ escalated；「出現不良反應」
 * →比照 A105 呼叫既有 stopPlan()；其餘七類維持計畫原狀態，僅記錄檢討歷史。
 * 系統從未依分類結果自動調整行動、指標或強度（憲法 §3）。
 * A112：completed 後不可再 PATCH（上游 §17「不覆寫」）。
 */
export async function completeReview(
  userId: string,
  projectId: string,
  planId: string,
  reviewId: string,
  input: { classification: string; notes?: string },
): Promise<CompleteReviewResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (!REVIEW_CLASSIFICATIONS.includes(input.classification as ReviewClassification)) {
    return { ok: false, code: "INVALID_REQUEST" };
  }

  const db = getDb();
  const [review] = await db
    .select()
    .from(planReviews)
    .where(and(eq(planReviews.id, reviewId), eq(planReviews.planId, found.plan.id)))
    .limit(1);
  if (!review) return { ok: false, code: "NOT_FOUND" };
  if (review.status !== "in_review") return { ok: false, code: "INVALID_REQUEST" };

  const [updated] = await db
    .update(planReviews)
    .set({
      classification: input.classification,
      notes: input.notes,
      status: "completed",
      reviewedAt: new Date(),
      updatedAt: new Date(),
    })
    .where(eq(planReviews.id, review.id))
    .returning();

  const classification = input.classification as ReviewClassification;
  if (classification === "possibly_ineffective") {
    await db
      .update(interventionPlans)
      .set({ status: "ineffective", updatedAt: new Date() })
      .where(eq(interventionPlans.id, found.plan.id));
  } else if (classification === "needs_professional_evaluation") {
    await db
      .update(interventionPlans)
      .set({ status: "escalated", updatedAt: new Date() })
      .where(eq(interventionPlans.id, found.plan.id));
  } else if (classification === "adverse_event") {
    await stopPlan(userId, projectId, planId, "adverse_event");
  }

  return { ok: true, review: updated! };
}
