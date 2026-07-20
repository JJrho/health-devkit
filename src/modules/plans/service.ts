import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  checkIns,
  escalationSummaries,
  interventionActions,
  interventionPlans,
  planReviews,
  symptomEvents,
  trackingMetrics,
} from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";
import { findOwnedPlan, type PlanRow } from "./access";
import { checkPlanSafetyInfo, METRIC_CATEGORIES, type MetricCategory } from "./safety";

type AccessErrorCode = "PROJECT_ACCESS_DENIED" | "NOT_FOUND";

export type ActionRow = typeof interventionActions.$inferSelect;
export type MetricRow = typeof trackingMetrics.$inferSelect;
export type CheckInRow = typeof checkIns.$inferSelect;
export type SymptomEventRow = typeof symptomEvents.$inferSelect;
export type PlanReviewRow = typeof planReviews.$inferSelect;
export type EscalationSummaryRow = typeof escalationSummaries.$inferSelect;

export type PlanResult = { ok: true; planId: string } | { ok: false; code: AccessErrorCode };
export type PlanDetailResult =
  | {
      ok: true;
      plan: PlanRow;
      actions: ActionRow[];
      metrics: MetricRow[];
      checkIns: CheckInRow[];
      symptomEvents: SymptomEventRow[];
      reviews: PlanReviewRow[];
      escalationSummaries: EscalationSummaryRow[];
    }
  | { ok: false; code: AccessErrorCode };
export type ListPlansResult = { ok: true; plans: PlanRow[] } | { ok: false; code: "PROJECT_ACCESS_DENIED" };
export type MutationResult =
  | { ok: true }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" | "PLAN_ADVERSE_EVENT" };
export type UpdatePlanResult =
  | { ok: true; plan: PlanRow }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" | "PLAN_ADVERSE_EVENT" };

export type ActivateResult =
  | { ok: true; plan: PlanRow }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" }
  | { ok: false; code: "PLAN_SAFETY_INFO_REQUIRED"; missingFields: string[] };

export type SubResourceResult = { ok: true; id: string } | { ok: false; code: AccessErrorCode };

const EDITABLE_STATUSES = new Set(["draft", "needs_info"]);
/** A116：ineffective／escalated 亦可透過既有版本鏈調整回到 active（比照上游 §18.3 adjusted→active）。 */
const ADJUSTABLE_STATUSES = new Set(["active", "paused", "ineffective", "escalated"]);
const TERMINAL_STATUSES = new Set(["stopped", "archived"]);

/** A110：因不良反應停止的計畫，錯誤碼精緻化為上游 §24 逐字定義的 PLAN_ADVERSE_EVENT。 */
function isAdverseEventStop(plan: PlanRow): boolean {
  return plan.status === "stopped" && plan.stopReason === "adverse_event";
}

export interface CreatePlanInput {
  title: string;
  baseline?: string;
  riskNote?: string;
  stopCondition?: string;
  referralCondition?: string;
  reviewDate?: Date;
}

export async function createPlan(
  userId: string,
  projectId: string,
  input: CreatePlanInput,
): Promise<PlanResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const [row] = await getDb()
    .insert(interventionPlans)
    .values({
      projectId: project.id,
      title: input.title,
      baseline: input.baseline,
      riskNote: input.riskNote,
      stopCondition: input.stopCondition,
      referralCondition: input.referralCondition,
      reviewDate: input.reviewDate,
    })
    .returning();
  return { ok: true, planId: row!.id };
}

/**
 * A96／A97：已啟用計畫的調整（PATCH）改為新增列＋前版封存的版本鏈，
 * 列表僅回傳版本鏈末端（比照 `messages` regenerate 排除已取代版本模式，A78 先例），
 * 不重複顯示被 `previousVersionId` 指到的舊版本。
 */
export async function listPlans(userId: string, projectId: string): Promise<ListPlansResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const rows = await getDb()
    .select()
    .from(interventionPlans)
    .where(and(eq(interventionPlans.projectId, project.id), isNull(interventionPlans.deletedAt)));
  const supersededIds = new Set(rows.filter((p) => p.previousVersionId).map((p) => p.previousVersionId!));
  const visible = rows.filter((p) => !supersededIds.has(p.id));
  return { ok: true, plans: visible };
}

export async function getPlan(userId: string, projectId: string, planId: string): Promise<PlanDetailResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  const db = getDb();
  const actions = await db
    .select()
    .from(interventionActions)
    .where(and(eq(interventionActions.planId, found.plan.id), isNull(interventionActions.deletedAt)));
  const metrics = await db
    .select()
    .from(trackingMetrics)
    .where(and(eq(trackingMetrics.planId, found.plan.id), isNull(trackingMetrics.deletedAt)));
  const checkInRows = await db
    .select()
    .from(checkIns)
    .where(and(eq(checkIns.planId, found.plan.id), isNull(checkIns.deletedAt)));
  const symptomEventRows = await db.select().from(symptomEvents).where(eq(symptomEvents.planId, found.plan.id));
  const reviewRows = await db.select().from(planReviews).where(eq(planReviews.planId, found.plan.id));
  const escalationSummaryRows = await db
    .select()
    .from(escalationSummaries)
    .where(eq(escalationSummaries.planId, found.plan.id));

  return {
    ok: true,
    plan: found.plan,
    actions,
    metrics,
    checkIns: checkInRows,
    symptomEvents: symptomEventRows,
    reviews: reviewRows,
    escalationSummaries: escalationSummaryRows,
  };
}

export interface UpdatePlanInput {
  title?: string;
  baseline?: string;
  riskNote?: string;
  stopCondition?: string;
  referralCondition?: string;
  reviewDate?: Date;
}

/**
 * draft／needs_info：就地編輯（autosave 友善）。
 * active／paused（A96）：改為新增列＋前版封存的版本鏈，非原地覆寫，落實憲法 §4
 * 「原值永遠保留、編輯建立新版本」。其餘狀態（stopped／archived）不可編輯。
 */
export async function updatePlan(
  userId: string,
  projectId: string,
  planId: string,
  input: UpdatePlanInput,
): Promise<UpdatePlanResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  const plan = found.plan;

  if (EDITABLE_STATUSES.has(plan.status)) {
    const [updated] = await getDb()
      .update(interventionPlans)
      .set({ ...input, updatedAt: new Date() })
      .where(eq(interventionPlans.id, plan.id))
      .returning();
    return { ok: true, plan: updated! };
  }

  if (ADJUSTABLE_STATUSES.has(plan.status)) {
    const newPlan = await createAdjustedVersion(plan, input);
    return { ok: true, plan: newPlan };
  }

  if (isAdverseEventStop(plan)) return { ok: false, code: "PLAN_ADVERSE_EVENT" };
  return { ok: false, code: "INVALID_REQUEST" };
}

/** A116：ineffective／escalated 調整後回到 active（比照上游 §18.3 adjusted→active）；active／paused 調整維持原狀態不變。 */
function nextVersionBaseStatus(status: string): string {
  return status === "ineffective" || status === "escalated" ? "active" : status;
}

/**
 * A96／A97／A100：建立新版本、複製子資源、重新跑安全審查。
 * `input` 欄位為 undefined 時沿用舊值；顯式傳入空字串（清空欄位）會生效，
 * 讓「調整」真的可以移除安全欄位——因此必須重新審查（A100），不可維持 active。
 */
async function createAdjustedVersion(plan: PlanRow, input: UpdatePlanInput): Promise<PlanRow> {
  const db = getDb();
  const actions = await db
    .select()
    .from(interventionActions)
    .where(and(eq(interventionActions.planId, plan.id), isNull(interventionActions.deletedAt)));
  const metrics = await db
    .select()
    .from(trackingMetrics)
    .where(and(eq(trackingMetrics.planId, plan.id), isNull(trackingMetrics.deletedAt)));

  return db.transaction(async (tx) => {
    await tx
      .update(interventionPlans)
      .set({ status: "archived", updatedAt: new Date() })
      .where(eq(interventionPlans.id, plan.id));

    const [newPlan] = await tx
      .insert(interventionPlans)
      .values({
        projectId: plan.projectId,
        title: input.title ?? plan.title,
        baseline: input.baseline ?? plan.baseline,
        riskNote: input.riskNote ?? plan.riskNote,
        stopCondition: input.stopCondition ?? plan.stopCondition,
        referralCondition: input.referralCondition ?? plan.referralCondition,
        reviewDate: input.reviewDate ?? plan.reviewDate,
        status: nextVersionBaseStatus(plan.status),
        previousVersionId: plan.id,
        version: plan.version + 1,
      })
      .returning();

    if (actions.length > 0) {
      await tx.insert(interventionActions).values(
        actions.map((a) => ({ planId: newPlan!.id, description: a.description, category: a.category })),
      );
    }
    if (metrics.length > 0) {
      await tx.insert(trackingMetrics).values(
        metrics.map((m) => ({
          planId: newPlan!.id,
          category: m.category,
          name: m.name,
          description: m.description,
        })),
      );
    }

    const check = checkPlanSafetyInfo(newPlan!, metrics.map((m) => m.category));
    if (!check.ok) {
      const [downgraded] = await tx
        .update(interventionPlans)
        .set({ status: "needs_info", updatedAt: new Date() })
        .where(eq(interventionPlans.id, newPlan!.id))
        .returning();
      return downgraded!;
    }

    return newPlan!;
  });
}

export async function deletePlan(userId: string, projectId: string, planId: string): Promise<MutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  await getDb()
    .update(interventionPlans)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(interventionPlans.id, found.plan.id));
  return { ok: true };
}

async function getMetricCategories(planId: string): Promise<string[]> {
  const rows = await getDb()
    .select({ category: trackingMetrics.category })
    .from(trackingMetrics)
    .where(and(eq(trackingMetrics.planId, planId), isNull(trackingMetrics.deletedAt)));
  return rows.map((r) => r.category);
}

/** A87：結構化安全審查，通過即 status→active；不通過則 status→needs_info＋回傳缺漏清單。 */
export async function activatePlan(
  userId: string,
  projectId: string,
  planId: string,
): Promise<ActivateResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  const plan = found.plan;
  if (!EDITABLE_STATUSES.has(plan.status)) return { ok: false, code: "INVALID_REQUEST" };

  const metricCategories = await getMetricCategories(plan.id);
  const check = checkPlanSafetyInfo(plan, metricCategories);

  if (!check.ok) {
    await getDb()
      .update(interventionPlans)
      .set({ status: "needs_info", updatedAt: new Date() })
      .where(eq(interventionPlans.id, plan.id));
    return { ok: false, code: "PLAN_SAFETY_INFO_REQUIRED", missingFields: check.missingFields };
  }

  const [updated] = await getDb()
    .update(interventionPlans)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(interventionPlans.id, plan.id))
    .returning();
  return { ok: true, plan: updated! };
}

export async function pausePlan(userId: string, projectId: string, planId: string): Promise<MutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (isAdverseEventStop(found.plan)) return { ok: false, code: "PLAN_ADVERSE_EVENT" };
  if (found.plan.status !== "active") return { ok: false, code: "INVALID_REQUEST" };

  await getDb()
    .update(interventionPlans)
    .set({ status: "paused", updatedAt: new Date() })
    .where(eq(interventionPlans.id, found.plan.id));
  return { ok: true };
}

export async function resumePlan(userId: string, projectId: string, planId: string): Promise<MutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (isAdverseEventStop(found.plan)) return { ok: false, code: "PLAN_ADVERSE_EVENT" };
  if (found.plan.status !== "paused") return { ok: false, code: "INVALID_REQUEST" };

  await getDb()
    .update(interventionPlans)
    .set({ status: "active", updatedAt: new Date() })
    .where(eq(interventionPlans.id, found.plan.id));
  return { ok: true };
}

/**
 * A90：stopReason 僅提供原語欄位（user_choice／adverse_event），本輪不含
 * 症狀事件自動觸發鏈——由呼叫端（未來 E5-F2）決定傳入的 reason。
 */
export async function stopPlan(
  userId: string,
  projectId: string,
  planId: string,
  reason: "user_choice" | "adverse_event",
): Promise<MutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (TERMINAL_STATUSES.has(found.plan.status)) return { ok: false, code: "INVALID_REQUEST" };

  await getDb()
    .update(interventionPlans)
    .set({ status: "stopped", stopReason: reason, updatedAt: new Date() })
    .where(eq(interventionPlans.id, found.plan.id));
  return { ok: true };
}

export async function addAction(
  userId: string,
  projectId: string,
  planId: string,
  description: string,
  category?: string,
): Promise<SubResourceResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  const [row] = await getDb()
    .insert(interventionActions)
    .values({ planId: found.plan.id, description, category })
    .returning();
  return { ok: true, id: row!.id };
}

export async function removeAction(
  userId: string,
  projectId: string,
  planId: string,
  actionId: string,
): Promise<MutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  const rows = await getDb()
    .update(interventionActions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(interventionActions.id, actionId), eq(interventionActions.planId, found.plan.id)))
    .returning();
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true };
}

export async function addMetric(
  userId: string,
  projectId: string,
  planId: string,
  category: string,
  name: string,
  description?: string,
): Promise<SubResourceResult | { ok: false; code: "INVALID_REQUEST" }> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (!METRIC_CATEGORIES.includes(category as MetricCategory)) {
    return { ok: false, code: "INVALID_REQUEST" };
  }

  const [row] = await getDb()
    .insert(trackingMetrics)
    .values({ planId: found.plan.id, category, name, description })
    .returning();
  return { ok: true, id: row!.id };
}

export async function removeMetric(
  userId: string,
  projectId: string,
  planId: string,
  metricId: string,
): Promise<MutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  const rows = await getDb()
    .update(trackingMetrics)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(trackingMetrics.id, metricId), eq(trackingMetrics.planId, found.plan.id)))
    .returning();
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true };
}
