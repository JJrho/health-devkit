import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closePool } from "@/db/client";
import { interventionPlans, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import {
  activatePlan,
  addAction,
  addMetric,
  createPlan,
  deletePlan,
  getPlan,
  listPlans,
  pausePlan,
  removeAction,
  removeMetric,
  resumePlan,
  stopPlan,
  updatePlan,
} from "@/modules/plans";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/** E5-F1 Part 1/2 整合測試（Sprint 17，AC-1～AC-10；連實庫）。 */
const hasDb = Boolean(process.env.DATABASE_URL);

async function seedUser(prefix = "plan"): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `${prefix}-${id}@projects.test.invalid` });
  return id;
}

/** 建立一份填妥安全欄位＋三分類指標各一筆的計畫，供 activate 成功情境重用。 */
async function createReadyPlan(ownerId: string, projectId: string): Promise<string> {
  const created = await createPlan(ownerId, projectId, {
    title: "運動計畫",
    baseline: "目前每週活動 0 次",
    riskNote: "無已知心血管疾病",
    stopCondition: "出現胸悶或異常呼吸困難立即停止",
    referralCondition: "疼痛持續超過一週",
    reviewDate: new Date("2026-08-01"),
  });
  if (!created.ok) throw new Error("setup failed");
  await addMetric(ownerId, projectId, created.planId, "leading", "每週活動次數");
  await addMetric(ownerId, projectId, created.planId, "outcome", "體重");
  await addMetric(ownerId, projectId, created.planId, "safety", "新的或加重的疼痛");
  return created.planId;
}

describe.skipIf(!hasDb)("plans module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("plan-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1／AC-2（建立草稿）：安全欄位可留空，status 預設 draft", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "計畫測試專案");
    const result = await createPlan(ownerId, project.id, { title: "只填標題" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const [row] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, result.planId));
    expect(row!.status).toBe("draft");
    expect(row!.baseline).toBeNull();
  });

  it("AC-3（安全檢查通過）：欄位與三分類指標齊全，activate 成功轉 active", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "啟用成功測試專案");
    const planId = await createReadyPlan(ownerId, project.id);

    const result = await activatePlan(ownerId, project.id, planId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.status).toBe("active");
  });

  it("AC-4（安全檢查不通過：欄位缺漏）：缺 stopCondition，回 PLAN_SAFETY_INFO_REQUIRED 且 status→needs_info", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "欄位缺漏測試專案");
    const created = await createPlan(ownerId, project.id, {
      title: "缺欄位計畫",
      baseline: "基準",
      riskNote: "風險",
      referralCondition: "轉介條件",
      reviewDate: new Date("2026-08-01"),
    });
    if (!created.ok) throw new Error("setup failed");
    await addMetric(ownerId, project.id, created.planId, "leading", "l");
    await addMetric(ownerId, project.id, created.planId, "outcome", "o");
    await addMetric(ownerId, project.id, created.planId, "safety", "s");

    const result = await activatePlan(ownerId, project.id, created.planId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PLAN_SAFETY_INFO_REQUIRED");
    if (result.code !== "PLAN_SAFETY_INFO_REQUIRED") return;
    expect(result.missingFields).toContain("stopCondition");

    const [row] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, created.planId));
    expect(row!.status).toBe("needs_info");
  });

  it("AC-5（安全檢查不通過：指標缺漏）：無 safety 分類指標，回缺漏清單含 metric:safety", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "指標缺漏測試專案");
    const created = await createPlan(ownerId, project.id, {
      title: "缺安全指標計畫",
      baseline: "基準",
      riskNote: "風險",
      stopCondition: "停止條件",
      referralCondition: "轉介條件",
      reviewDate: new Date("2026-08-01"),
    });
    if (!created.ok) throw new Error("setup failed");
    await addMetric(ownerId, project.id, created.planId, "leading", "l");
    await addMetric(ownerId, project.id, created.planId, "outcome", "o");

    const result = await activatePlan(ownerId, project.id, created.planId);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.code).toBe("PLAN_SAFETY_INFO_REQUIRED");
    if (result.code !== "PLAN_SAFETY_INFO_REQUIRED") return;
    expect(result.missingFields).toContain("metric:safety");
  });

  it("AC-6（暫停／恢復）：active→paused→active 正確轉換，draft 呼叫 pause 應拒絕", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "暫停恢復測試專案");
    const planId = await createReadyPlan(ownerId, project.id);
    await activatePlan(ownerId, project.id, planId);

    const paused = await pausePlan(ownerId, project.id, planId);
    expect(paused.ok).toBe(true);
    const [afterPause] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(afterPause!.status).toBe("paused");

    const resumed = await resumePlan(ownerId, project.id, planId);
    expect(resumed.ok).toBe(true);
    const [afterResume] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(afterResume!.status).toBe("active");

    const draftPlan = await createPlan(ownerId, project.id, { title: "草稿計畫" });
    if (!draftPlan.ok) throw new Error("setup failed");
    const invalidPause = await pausePlan(ownerId, project.id, draftPlan.planId);
    expect(invalidPause).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-7（停止）：任一非終態可停止，stopReason 正確記錄，終態不可再轉換", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "停止測試專案");
    const planId = await createReadyPlan(ownerId, project.id);
    await activatePlan(ownerId, project.id, planId);

    const stopped = await stopPlan(ownerId, project.id, planId, "adverse_event");
    expect(stopped.ok).toBe(true);
    const [row] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(row!.status).toBe("stopped");
    expect(row!.stopReason).toBe("adverse_event");

    const stopAgain = await stopPlan(ownerId, project.id, planId, "user_choice");
    expect(stopAgain).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-8（子資源歸屬與四層鏈）：跨帳號操作 action／metric 一律拒絕", async () => {
    const ownerId = await seedUser();
    const otherId = await seedUser();
    const project = await createProject(ownerId, "四層鏈測試專案");
    const planId = await createReadyPlan(ownerId, project.id);

    const deniedAction = await addAction(otherId, project.id, planId, "他人嘗試新增");
    expect(deniedAction).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });

    const action = await addAction(ownerId, project.id, planId, "步行 20 分鐘", "exercise");
    expect(action.ok).toBe(true);
    if (!action.ok) return;

    const deniedRemove = await removeAction(otherId, project.id, planId, action.id);
    expect(deniedRemove).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });

    const removed = await removeAction(ownerId, project.id, planId, action.id);
    expect(removed).toEqual({ ok: true });

    const metric = await addMetric(ownerId, project.id, planId, "leading", "測試指標");
    expect(metric.ok).toBe(true);
    if (!metric.ok) return;
    const deniedMetricRemove = await removeMetric(otherId, project.id, planId, metric.id);
    expect(deniedMetricRemove).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
  });

  it("AC-9（軟刪除）：刪除計畫不出現在列表，直接查詢回 NOT_FOUND", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "軟刪除測試專案");
    const created = await createPlan(ownerId, project.id, { title: "待刪除計畫" });
    if (!created.ok) throw new Error("setup failed");

    const deleted = await deletePlan(ownerId, project.id, created.planId);
    expect(deleted).toEqual({ ok: true });

    const list = await listPlans(ownerId, project.id);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    expect(list.plans.map((p) => p.id)).not.toContain(created.planId);

    const fetched = await getPlan(ownerId, project.id, created.planId);
    expect(fetched).toEqual({ ok: false, code: "NOT_FOUND" });
  });

  it("AC-9（延伸）：updatePlan 僅 draft／needs_info 可編輯，active 計畫編輯應拒絕", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "編輯限制測試專案");
    const planId = await createReadyPlan(ownerId, project.id);

    const draftEdit = await updatePlan(ownerId, project.id, planId, { title: "改標題" });
    expect(draftEdit).toEqual({ ok: true });

    await activatePlan(ownerId, project.id, planId);
    const activeEdit = await updatePlan(ownerId, project.id, planId, { title: "再改一次" });
    expect(activeEdit).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-10（日誌 P0）：建立／啟用計畫過程不將健康敘述內容寫入日誌", async () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const marker = `plan-log-marker-${randomUUID()}`;
    const created = await createPlan(ownerId, project.id, {
      title: "日誌測試計畫",
      baseline: marker,
      riskNote: marker,
      stopCondition: marker,
      referralCondition: marker,
      reviewDate: new Date("2026-08-01"),
    });
    if (!created.ok) throw new Error("setup failed");
    await addMetric(ownerId, project.id, created.planId, "leading", marker);
    await addMetric(ownerId, project.id, created.planId, "outcome", marker);
    await addMetric(ownerId, project.id, created.planId, "safety", marker);
    await activatePlan(ownerId, project.id, created.planId);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain(marker);
    infoSpy.mockRestore();
  });
});
