import { randomUUID } from "crypto";
import { afterAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closePool } from "@/db/client";
import { interventionActions, interventionPlans, trackingMetrics, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import { activatePlan, addAction, addMetric, createPlan, listPlans, updatePlan } from "@/modules/plans";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E5-F1 Part 2/2 整合測試（Sprint 18，AC-4～AC-6／AC-8；連實庫）。
 * 聚焦版本鏈（A96／A97／A100）——Part 1/2 已涵蓋的建立／安全審查／狀態轉換／
 * 四層鏈不重複驗證，見 plans-service.test.ts。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `plan2-${id}@projects.test.invalid` });
  return id;
}

async function createActivePlan(ownerId: string, projectId: string) {
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
  const activated = await activatePlan(ownerId, projectId, created.planId);
  if (!activated.ok) throw new Error("setup failed to activate");
  return created.planId;
}

describe.skipIf(!hasDb)("plans module Part 2/2（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("plan2-%@projects.test.invalid");
    await closePool();
  });

  it("AC-4（調整已啟用計畫）：建立新版本，previousVersionId 指向舊列，version+1，舊列 status→archived", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "版本鏈測試專案");
    const oldPlanId = await createActivePlan(ownerId, project.id);

    const result = await updatePlan(ownerId, project.id, oldPlanId, { title: "調整後標題" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.plan.id).not.toBe(oldPlanId);
    expect(result.plan.previousVersionId).toBe(oldPlanId);
    expect(result.plan.version).toBe(2);
    expect(result.plan.title).toBe("調整後標題");
    expect(result.plan.status).toBe("active");

    const [oldRow] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, oldPlanId));
    expect(oldRow!.status).toBe("archived");
  });

  it("AC-5（子資源隨版本複製）：新版本可查得與舊版本相同的行動與指標內容（新 id，掛新 plan id）", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "子資源複製測試專案");
    const oldPlanId = await createActivePlan(ownerId, project.id);
    await addAction(ownerId, project.id, oldPlanId, "每天散步 20 分鐘", "exercise");

    const oldActions = await getDb()
      .select()
      .from(interventionActions)
      .where(eq(interventionActions.planId, oldPlanId));
    const oldMetrics = await getDb().select().from(trackingMetrics).where(eq(trackingMetrics.planId, oldPlanId));
    expect(oldActions).toHaveLength(1);
    expect(oldMetrics).toHaveLength(3);

    const result = await updatePlan(ownerId, project.id, oldPlanId, { title: "調整後標題" });
    if (!result.ok) throw new Error("adjust failed");
    const newPlanId = result.plan.id;

    const newActions = await getDb()
      .select()
      .from(interventionActions)
      .where(eq(interventionActions.planId, newPlanId));
    const newMetrics = await getDb().select().from(trackingMetrics).where(eq(trackingMetrics.planId, newPlanId));
    expect(newActions).toHaveLength(1);
    expect(newActions[0]!.description).toBe("每天散步 20 分鐘");
    expect(newActions[0]!.id).not.toBe(oldActions[0]!.id);
    expect(newMetrics).toHaveLength(3);
    expect(newMetrics.map((m) => m.category).sort()).toEqual(["leading", "outcome", "safety"]);

    // 舊版本子資源原樣保留（憲法 §4 原值永遠保留）
    const oldActionsAfter = await getDb()
      .select()
      .from(interventionActions)
      .where(eq(interventionActions.planId, oldPlanId));
    expect(oldActionsAfter).toHaveLength(1);
  });

  it("AC-6（調整後重新安全審查）：清空 stopCondition 送出調整，新版本強制降為 needs_info", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "調整降級測試專案");
    const oldPlanId = await createActivePlan(ownerId, project.id);

    const result = await updatePlan(ownerId, project.id, oldPlanId, { stopCondition: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.status).toBe("needs_info");
    expect(result.plan.stopCondition).toBe("");
  });

  it("AC-8（列表排除舊版本）：調整後 listPlans 僅回傳最新版本", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "列表排除測試專案");
    const oldPlanId = await createActivePlan(ownerId, project.id);

    const result = await updatePlan(ownerId, project.id, oldPlanId, { title: "新版本標題" });
    if (!result.ok) throw new Error("adjust failed");

    const list = await listPlans(ownerId, project.id);
    expect(list.ok).toBe(true);
    if (!list.ok) return;
    const ids = list.plans.map((p) => p.id);
    expect(ids).toContain(result.plan.id);
    expect(ids).not.toContain(oldPlanId);
    expect(list.plans).toHaveLength(1);
  });

  it("AC-9（延伸：draft/needs_info 不受影響）：draft 狀態的 updatePlan 仍為就地編輯，不建立新版本", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "就地編輯回歸測試專案");
    const created = await createPlan(ownerId, project.id, { title: "草稿計畫" });
    if (!created.ok) throw new Error("setup failed");

    const result = await updatePlan(ownerId, project.id, created.planId, { title: "改標題" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.plan.id).toBe(created.planId);
    expect(result.plan.previousVersionId).toBeNull();
    expect(result.plan.version).toBe(1);
  });
});
