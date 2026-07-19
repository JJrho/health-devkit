import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { interventionPlans } from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";

export type PlanRow = typeof interventionPlans.$inferSelect;

export type FindOwnedPlanResult =
  | { ok: true; plan: PlanRow }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" };

/**
 * 四層鏈（A86）：先以 findOwnedProject 判斷第 1／2／4 層（非擁有者一律
 * PROJECT_ACCESS_DENIED），再比對 plan 是否屬於該 project（否則 NOT_FOUND）。
 * 比照 observations 模組 findOwnedObservation 既有兩段式判斷慣例，避免把
 * 「沒有權限」與「資源不存在」誤判為同一種結果。
 */
export async function findOwnedPlan(
  userId: string,
  projectId: string,
  planId: string,
): Promise<FindOwnedPlanResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const rows = await getDb()
    .select()
    .from(interventionPlans)
    .where(
      and(
        eq(interventionPlans.id, planId),
        eq(interventionPlans.projectId, project.id),
        isNull(interventionPlans.deletedAt),
      ),
    )
    .limit(1);
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, plan: rows[0] };
}
