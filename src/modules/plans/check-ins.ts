import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { checkIns, trackingMetrics } from "@/db/schema";
import { findOwnedPlan } from "./access";

type AccessErrorCode = "PROJECT_ACCESS_DENIED" | "NOT_FOUND";

export type CreateCheckInResult =
  | { ok: true; id: string }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" };
export type CheckInMutationResult = { ok: true } | { ok: false; code: AccessErrorCode };

/** A109：僅計畫執行期間（active／paused）可新增日常回報，未啟用或已終止不可新增。 */
const EXECUTABLE_STATUSES = new Set(["active", "paused"]);

export interface CreateCheckInInput {
  metricId: string;
  value: string;
  note?: string;
  checkinDate: Date;
}

export async function createCheckIn(
  userId: string,
  projectId: string,
  planId: string,
  input: CreateCheckInInput,
): Promise<CreateCheckInResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (!EXECUTABLE_STATUSES.has(found.plan.status)) return { ok: false, code: "INVALID_REQUEST" };

  const [metric] = await getDb()
    .select()
    .from(trackingMetrics)
    .where(
      and(
        eq(trackingMetrics.id, input.metricId),
        eq(trackingMetrics.planId, found.plan.id),
        isNull(trackingMetrics.deletedAt),
      ),
    )
    .limit(1);
  if (!metric) return { ok: false, code: "NOT_FOUND" };

  const [row] = await getDb()
    .insert(checkIns)
    .values({
      planId: found.plan.id,
      metricId: input.metricId,
      value: input.value,
      note: input.note,
      checkinDate: input.checkinDate,
    })
    .returning();
  return { ok: true, id: row!.id };
}

/** 更正（上游 §17）：不受計畫目前狀態限制，比照 A98 既有子資源編輯精神。 */
export async function updateCheckIn(
  userId: string,
  projectId: string,
  planId: string,
  checkInId: string,
  input: { value?: string; note?: string },
): Promise<CheckInMutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  const rows = await getDb()
    .update(checkIns)
    .set({ ...input, status: "corrected", updatedAt: new Date() })
    .where(and(eq(checkIns.id, checkInId), eq(checkIns.planId, found.plan.id)))
    .returning();
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true };
}

export async function deleteCheckIn(
  userId: string,
  projectId: string,
  planId: string,
  checkInId: string,
): Promise<CheckInMutationResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;

  const rows = await getDb()
    .update(checkIns)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(checkIns.id, checkInId), eq(checkIns.planId, found.plan.id)))
    .returning();
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true };
}
