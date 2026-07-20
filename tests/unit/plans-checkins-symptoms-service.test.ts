import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closePool } from "@/db/client";
import { interventionPlans, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import {
  activatePlan,
  addMetric,
  createCheckIn,
  createPlan,
  createSymptomEvent,
  deleteCheckIn,
  getPlan,
  pausePlan,
  resumePlan,
  updateCheckIn,
  updateSymptomEvent,
} from "@/modules/plans";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E5-F2 整合測試（Sprint 19，AC-1～AC-10；連實庫）。
 * 聚焦 check-ins／symptom events CRUD 與不良反應暫停鏈（A105）——
 * Sprint 17/18 已涵蓋的計畫核心邏輯不重複驗證，見 plans-service.test.ts。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `plan3-${id}@projects.test.invalid` });
  return id;
}

/** 建立一份填妥安全欄位＋三分類指標並成功啟用的計畫，回傳 planId 與 leading 指標 id。 */
async function createActivePlanWithMetric(ownerId: string, projectId: string) {
  const created = await createPlan(ownerId, projectId, {
    title: "運動計畫",
    baseline: "目前每週活動 0 次",
    riskNote: "無已知心血管疾病",
    stopCondition: "出現胸悶或異常呼吸困難立即停止",
    referralCondition: "疼痛持續超過一週",
    reviewDate: new Date("2026-08-01"),
  });
  if (!created.ok) throw new Error("setup failed");
  const leading = await addMetric(ownerId, projectId, created.planId, "leading", "每週活動次數");
  await addMetric(ownerId, projectId, created.planId, "outcome", "體重");
  await addMetric(ownerId, projectId, created.planId, "safety", "新的或加重的疼痛");
  if (!leading.ok) throw new Error("setup failed");
  const activated = await activatePlan(ownerId, projectId, created.planId);
  if (!activated.ok) throw new Error("setup failed to activate");
  return { planId: created.planId, metricId: leading.id };
}

describe.skipIf(!hasDb)("plans check-ins／symptom events（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("plan3-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1（check-in 建立成功）：active 計畫、有效指標 → 成功建立，status=submitted", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "check-in 建立測試專案");
    const { planId, metricId } = await createActivePlanWithMetric(ownerId, project.id);

    const result = await createCheckIn(ownerId, project.id, planId, {
      metricId,
      value: "3",
      checkinDate: new Date("2026-07-20"),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const detail = await getPlan(ownerId, project.id, planId);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.checkIns).toHaveLength(1);
    expect(detail.checkIns[0]!.status).toBe("submitted");
  });

  it("AC-2（check-in 拒絕情境）：draft 計畫拒絕新增；跨計畫 metricId 回 NOT_FOUND", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "check-in 拒絕測試專案");
    const { planId: activePlanId, metricId } = await createActivePlanWithMetric(ownerId, project.id);
    const { metricId: otherPlanMetricId } = await createActivePlanWithMetric(ownerId, project.id);

    const draftPlan = await createPlan(ownerId, project.id, { title: "草稿計畫" });
    if (!draftPlan.ok) throw new Error("setup failed");

    const draftResult = await createCheckIn(ownerId, project.id, draftPlan.planId, {
      metricId,
      value: "1",
      checkinDate: new Date("2026-07-20"),
    });
    expect(draftResult).toEqual({ ok: false, code: "INVALID_REQUEST" });

    const crossPlanResult = await createCheckIn(ownerId, project.id, activePlanId, {
      metricId: otherPlanMetricId, // 真實存在但屬於另一個計畫的指標
      value: "1",
      checkinDate: new Date("2026-07-20"),
    });
    expect(crossPlanResult).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("AC-3（check-in 更正與刪除）：更正後 status→corrected；刪除後從詳情消失", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "check-in 更正刪除測試專案");
    const { planId, metricId } = await createActivePlanWithMetric(ownerId, project.id);

    const created = await createCheckIn(ownerId, project.id, planId, {
      metricId,
      value: "2",
      checkinDate: new Date("2026-07-20"),
    });
    if (!created.ok) throw new Error("setup failed");

    const updated = await updateCheckIn(ownerId, project.id, planId, created.id, { value: "5" });
    expect(updated).toEqual({ ok: true });

    let detail = await getPlan(ownerId, project.id, planId);
    if (!detail.ok) throw new Error("unexpected");
    expect(detail.checkIns[0]!.value).toBe("5");
    expect(detail.checkIns[0]!.status).toBe("corrected");

    const deleted = await deleteCheckIn(ownerId, project.id, planId, created.id);
    expect(deleted).toEqual({ ok: true });

    detail = await getPlan(ownerId, project.id, planId);
    if (!detail.ok) throw new Error("unexpected");
    expect(detail.checkIns).toHaveLength(0);
  });

  it("AC-4（症狀事件：一般回報）：isAdverseEvent=false，計畫狀態不受影響", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "症狀一般回報測試專案");
    const { planId } = await createActivePlanWithMetric(ownerId, project.id);

    const result = await createSymptomEvent(ownerId, project.id, planId, {
      description: "輕微疲勞",
      occurredAt: new Date("2026-07-20"),
      isAdverseEvent: false,
    });
    expect(result.ok).toBe(true);

    const [plan] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(plan!.status).toBe("active");
  });

  it("AC-5（不良反應暫停鏈，核心）：isAdverseEvent=true → 計畫自動轉 stopped／adverse_event", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "不良反應暫停鏈測試專案");
    const { planId } = await createActivePlanWithMetric(ownerId, project.id);

    const result = await createSymptomEvent(ownerId, project.id, planId, {
      description: "運動時胸悶",
      occurredAt: new Date("2026-07-20"),
      isAdverseEvent: true,
    });
    expect(result.ok).toBe(true);

    const [plan] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(plan!.status).toBe("stopped");
    expect(plan!.stopReason).toBe("adverse_event");
  });

  it("AC-6（停止後不得恢復，回歸確認）：因不良反應停止的計畫呼叫 resumePlan 應拒絕", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "停止後恢復回歸測試專案");
    const { planId } = await createActivePlanWithMetric(ownerId, project.id);
    await createSymptomEvent(ownerId, project.id, planId, {
      description: "胸悶",
      occurredAt: new Date("2026-07-20"),
      isAdverseEvent: true,
    });

    const resumed = await resumePlan(ownerId, project.id, planId);
    expect(resumed).toEqual({ ok: false, code: "PLAN_ADVERSE_EVENT" });

    const paused = await pausePlan(ownerId, project.id, planId);
    expect(paused).toEqual({ ok: false, code: "PLAN_ADVERSE_EVENT" });
  });

  it("AC-7（症狀事件狀態轉換）：open→monitoring→resolved／escalated 皆正確轉換", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "症狀狀態轉換測試專案");
    const { planId } = await createActivePlanWithMetric(ownerId, project.id);
    const created = await createSymptomEvent(ownerId, project.id, planId, {
      description: "偶爾頭暈",
      occurredAt: new Date("2026-07-20"),
    });
    if (!created.ok) throw new Error("setup failed");

    const toMonitoring = await updateSymptomEvent(ownerId, project.id, planId, created.id, {
      status: "monitoring",
    });
    expect(toMonitoring.ok).toBe(true);
    if (toMonitoring.ok) expect(toMonitoring.symptomEvent.status).toBe("monitoring");

    const toResolved = await updateSymptomEvent(ownerId, project.id, planId, created.id, {
      status: "resolved",
    });
    expect(toResolved.ok).toBe(true);
    if (toResolved.ok) expect(toResolved.symptomEvent.status).toBe("resolved");

    const invalidStatus = await updateSymptomEvent(ownerId, project.id, planId, created.id, {
      status: "not_a_real_status",
    });
    expect(invalidStatus).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-8（四層權限鏈）：跨帳號操作 check-in／症狀事件一律拒絕", async () => {
    const ownerId = await seedUser();
    const otherId = await seedUser();
    const project = await createProject(ownerId, "四層鏈測試專案");
    const { planId, metricId } = await createActivePlanWithMetric(ownerId, project.id);

    const deniedCheckIn = await createCheckIn(otherId, project.id, planId, {
      metricId,
      value: "1",
      checkinDate: new Date("2026-07-20"),
    });
    expect(deniedCheckIn).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });

    const deniedSymptom = await createSymptomEvent(otherId, project.id, planId, {
      description: "他人嘗試回報",
      occurredAt: new Date("2026-07-20"),
    });
    expect(deniedSymptom).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
  });

  it("AC-10（日誌 P0）：建立 check-in／症狀事件過程不將內容寫入日誌", async () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const { planId, metricId } = await createActivePlanWithMetric(ownerId, project.id);
    const marker = `plan3-log-marker-${randomUUID()}`;

    await createCheckIn(ownerId, project.id, planId, {
      metricId,
      value: marker,
      note: marker,
      checkinDate: new Date("2026-07-20"),
    });
    await createSymptomEvent(ownerId, project.id, planId, {
      description: marker,
      occurredAt: new Date("2026-07-20"),
    });

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain(marker);
    infoSpy.mockRestore();
  });
});
