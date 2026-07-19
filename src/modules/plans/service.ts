import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { interventionActions, interventionPlans, trackingMetrics } from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";
import { findOwnedPlan, type PlanRow } from "./access";
import { checkPlanSafetyInfo, METRIC_CATEGORIES, type MetricCategory } from "./safety";

type AccessErrorCode = "PROJECT_ACCESS_DENIED" | "NOT_FOUND";

export type PlanResult = { ok: true; planId: string } | { ok: false; code: AccessErrorCode };
export type PlanDetailResult = { ok: true; plan: PlanRow } | { ok: false; code: AccessErrorCode };
export type ListPlansResult = { ok: true; plans: PlanRow[] } | { ok: false; code: "PROJECT_ACCESS_DENIED" };
export type MutationResult = { ok: true } | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" };

export type ActivateResult =
  | { ok: true; plan: PlanRow }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" }
  | { ok: false; code: "PLAN_SAFETY_INFO_REQUIRED"; missingFields: string[] };

export type SubResourceResult = { ok: true; id: string } | { ok: false; code: AccessErrorCode };

const EDITABLE_STATUSES = new Set(["draft", "needs_info"]);
const TERMINAL_STATUSES = new Set(["stopped", "archived"]);

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

export async function listPlans(userId: string, projectId: string): Promise<ListPlansResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const rows = await getDb()
    .select()
    .from(interventionPlans)
    .where(and(eq(interventionPlans.projectId, project.id), isNull(interventionPlans.deletedAt)));
  return { ok: true, plans: rows };
}

export async function getPlan(userId: string, projectId: string, planId: string): Promise<PlanDetailResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  return { ok: true, plan: found.plan };
}

export interface UpdatePlanInput {
  title?: string;
  baseline?: string;
  riskNote?: string;
  stopCondition?: string;
  referralCondition?: string;
  reviewDate?: Date;
}

/** A89：僅 draft／needs_info 狀態可就地編輯；已啟用計畫本輪不開放編輯，留待 Part 2/2。 */
export async function updatePlan(
  userId: string,
  projectId: string,
  planId: string,
  input: UpdatePlanInput,
): Promise<MutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  const plan = found.plan;
  if (!EDITABLE_STATUSES.has(plan.status)) return { ok: false, code: "INVALID_REQUEST" };

  await getDb()
    .update(interventionPlans)
    .set({ ...input, updatedAt: new Date() })
    .where(eq(interventionPlans.id, plan.id));
  return { ok: true };
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
