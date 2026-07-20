import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { symptomEvents } from "@/db/schema";
import { findOwnedPlan } from "./access";
import { stopPlan, type SymptomEventRow } from "./service";

type AccessErrorCode = "PROJECT_ACCESS_DENIED" | "NOT_FOUND";

export type CreateSymptomEventResult =
  | { ok: true; id: string }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" };
export type UpdateSymptomEventResult =
  | { ok: true; symptomEvent: SymptomEventRow }
  | { ok: false; code: AccessErrorCode | "INVALID_REQUEST" };

/** A109：僅計畫執行期間（active／paused）可新增症狀事件。 */
const EXECUTABLE_STATUSES = new Set(["active", "paused"]);
const SYMPTOM_STATUSES = new Set(["open", "monitoring", "resolved", "escalated"]);

export interface CreateSymptomEventInput {
  description: string;
  occurredAt: Date;
  isAdverseEvent?: boolean;
}

/**
 * A105（核心安全設計）：isAdverseEvent 完全由使用者手動標記，系統不對
 * description 做語意分析自動判定。標記為 true 時立即呼叫既有 stopPlan()
 * （A90 預留介面），將關聯計畫轉為 stopped／adverse_event。
 */
export async function createSymptomEvent(
  userId: string,
  projectId: string,
  planId: string,
  input: CreateSymptomEventInput,
): Promise<CreateSymptomEventResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (!EXECUTABLE_STATUSES.has(found.plan.status)) return { ok: false, code: "INVALID_REQUEST" };

  const [row] = await getDb()
    .insert(symptomEvents)
    .values({
      planId: found.plan.id,
      description: input.description,
      occurredAt: input.occurredAt,
      isAdverseEvent: input.isAdverseEvent ?? false,
    })
    .returning();

  if (input.isAdverseEvent) {
    await stopPlan(userId, projectId, planId, "adverse_event");
  }

  return { ok: true, id: row!.id };
}

/**
 * 補充內容／狀態轉換（上游 §17）。isAdverseEvent 可事後補設為 true
 * （回溯標記為不良反應），同樣觸發 stopPlan()（A105 延伸）。
 * 本輪不提供 DELETE（A107）——症狀事件為醫療相關歷程記錄，只能補充或轉換狀態。
 */
export async function updateSymptomEvent(
  userId: string,
  projectId: string,
  planId: string,
  symptomEventId: string,
  input: { description?: string; status?: string; isAdverseEvent?: boolean },
): Promise<UpdateSymptomEventResult> {
  const found = await findOwnedPlan(userId, projectId, planId);
  if (!found.ok) return found;
  if (input.status !== undefined && !SYMPTOM_STATUSES.has(input.status)) {
    return { ok: false, code: "INVALID_REQUEST" };
  }

  const rows = await getDb()
    .update(symptomEvents)
    .set({ ...input, updatedAt: new Date() })
    .where(and(eq(symptomEvents.id, symptomEventId), eq(symptomEvents.planId, found.plan.id)))
    .returning();
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };

  if (input.isAdverseEvent === true) {
    await stopPlan(userId, projectId, planId, "adverse_event");
  }

  return { ok: true, symptomEvent: rows[0] };
}
