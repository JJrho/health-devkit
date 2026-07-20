import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closePool } from "@/db/client";
import { interventionPlans, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import {
  activatePlan,
  addMetric,
  completeReview,
  createEscalationSummary,
  createPlan,
  createReview,
  deleteEscalationSummary,
  getPlan,
  pausePlan,
  updateEscalationSummary,
  updatePlan,
} from "@/modules/plans";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E5-F3 整合測試（Sprint 20，AC-1～AC-12；連實庫）。
 * 聚焦定期檢討（十分類）與轉介摘要——Sprint 17～19 已涵蓋的計畫核心邏輯
 * 不重複驗證，見 plans-service.test.ts／plans-part2-service.test.ts。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `plan4-${id}@projects.test.invalid` });
  return id;
}

/** 建立一份已啟用、檢討日已過（可立即檢討）的計畫，回傳 planId。 */
async function createActiveDuePlan(ownerId: string, projectId: string) {
  const created = await createPlan(ownerId, projectId, {
    title: "運動計畫",
    baseline: "目前每週活動 0 次",
    riskNote: "無已知心血管疾病",
    stopCondition: "出現胸悶或異常呼吸困難立即停止",
    referralCondition: "疼痛持續超過一週",
    reviewDate: new Date("2020-01-01"),
  });
  if (!created.ok) throw new Error("setup failed");
  const leading = await addMetric(ownerId, projectId, created.planId, "leading", "每週活動次數");
  await addMetric(ownerId, projectId, created.planId, "outcome", "體重");
  await addMetric(ownerId, projectId, created.planId, "safety", "新的或加重的疼痛");
  if (!leading.ok) throw new Error("setup failed");
  const activated = await activatePlan(ownerId, projectId, created.planId);
  if (!activated.ok) throw new Error("setup failed to activate");
  return created.planId;
}

describe.skipIf(!hasDb)("plans reviews／escalation summaries（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("plan4-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1（檢討建立成功）：計畫 active 且已達檢討日 → 成功，status=in_review", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "檢討建立測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);

    const result = await createReview(ownerId, project.id, planId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const detail = await getPlan(ownerId, project.id, planId);
    expect(detail.ok).toBe(true);
    if (!detail.ok) return;
    expect(detail.reviews).toHaveLength(1);
    expect(detail.reviews[0]!.status).toBe("in_review");
  });

  it("AC-2（檢討建立拒絕情境）：未達檢討日或計畫非 active／paused → 一律拒絕", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "檢討拒絕測試專案");

    const draftPlan = await createPlan(ownerId, project.id, { title: "草稿計畫" });
    if (!draftPlan.ok) throw new Error("setup failed");
    const draftResult = await createReview(ownerId, project.id, draftPlan.planId);
    expect(draftResult).toEqual({ ok: false, code: "INVALID_REQUEST" });

    const notDuePlan = await createPlan(ownerId, project.id, {
      title: "未達檢討日計畫",
      baseline: "b",
      riskNote: "r",
      stopCondition: "s",
      referralCondition: "rc",
      reviewDate: new Date("2099-01-01"),
    });
    if (!notDuePlan.ok) throw new Error("setup failed");
    await addMetric(ownerId, project.id, notDuePlan.planId, "leading", "l");
    await addMetric(ownerId, project.id, notDuePlan.planId, "outcome", "o");
    await addMetric(ownerId, project.id, notDuePlan.planId, "safety", "s");
    await activatePlan(ownerId, project.id, notDuePlan.planId);
    const notDueResult = await createReview(ownerId, project.id, notDuePlan.planId);
    expect(notDueResult).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-3（檢討完成，十分類）：送出十分類判斷之一 → status=completed，reviewedAt 寫入", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "檢討完成測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const created = await createReview(ownerId, project.id, planId);
    if (!created.ok) throw new Error("setup failed");

    const result = await completeReview(ownerId, project.id, planId, created.id, {
      classification: "improved",
      notes: "持續進步中",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.review.status).toBe("completed");
    expect(result.review.classification).toBe("improved");
    expect(result.review.reviewedAt).not.toBeNull();
  });

  it("AC-4（十分類為非法值）：送出不在清單內的字串 → 拒絕，確認為白名單驗證", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "十分類白名單測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const created = await createReview(ownerId, project.id, planId);
    if (!created.ok) throw new Error("setup failed");

    const result = await completeReview(ownerId, project.id, planId, created.id, {
      classification: "沒有改善也沒有惡化",
    });
    expect(result).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-5（無改善不自動增強度，核心）：分類為「計畫可能無效」→ 計畫轉 ineffective，行動與指標不受影響", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "無改善核心測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const created = await createReview(ownerId, project.id, planId);
    if (!created.ok) throw new Error("setup failed");

    const before = await getPlan(ownerId, project.id, planId);
    if (!before.ok) throw new Error("unexpected");

    await completeReview(ownerId, project.id, planId, created.id, { classification: "possibly_ineffective" });

    const [plan] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(plan!.status).toBe("ineffective");

    const after = await getPlan(ownerId, project.id, planId);
    if (!after.ok) throw new Error("unexpected");
    expect(after.actions).toEqual(before.actions);
    expect(after.metrics.map((m) => m.name).sort()).toEqual(before.metrics.map((m) => m.name).sort());
  });

  it("AC-6（需要專業評估）：分類為「需要專業評估」→ 計畫轉 escalated", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "需要專業評估測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const created = await createReview(ownerId, project.id, planId);
    if (!created.ok) throw new Error("setup failed");

    await completeReview(ownerId, project.id, planId, created.id, {
      classification: "needs_professional_evaluation",
    });

    const [plan] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(plan!.status).toBe("escalated");
  });

  it("AC-7（有改善等七類）：分類為其餘七類之一 → 計畫狀態不變", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "維持狀態測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const created = await createReview(ownerId, project.id, planId);
    if (!created.ok) throw new Error("setup failed");

    await completeReview(ownerId, project.id, planId, created.id, { classification: "hard_to_sustain" });

    const [plan] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(plan!.status).toBe("active");
  });

  it("AC-7（延伸）：分類為「出現不良反應」→ 比照 A105 觸發既有 stopPlan()", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "檢討路徑觸發暫停鏈測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const created = await createReview(ownerId, project.id, planId);
    if (!created.ok) throw new Error("setup failed");

    await completeReview(ownerId, project.id, planId, created.id, { classification: "adverse_event" });

    const [plan] = await getDb().select().from(interventionPlans).where(eq(interventionPlans.id, planId));
    expect(plan!.status).toBe("stopped");
    expect(plan!.stopReason).toBe("adverse_event");
  });

  it("AC-8（已完成的檢討不可覆寫）：completed 後再次 PATCH → 拒絕", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "不覆寫測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const created = await createReview(ownerId, project.id, planId);
    if (!created.ok) throw new Error("setup failed");
    await completeReview(ownerId, project.id, planId, created.id, { classification: "improved" });

    const second = await completeReview(ownerId, project.id, planId, created.id, {
      classification: "partially_improved",
    });
    expect(second).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-9（轉介摘要 CRUD）：需先有需要專業評估的檢討才能產生；狀態轉換與刪除皆正確", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "轉介摘要 CRUD 測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);

    const tooEarly = await createEscalationSummary(ownerId, project.id, planId);
    expect(tooEarly).toEqual({ ok: false, code: "INVALID_REQUEST" });

    const review = await createReview(ownerId, project.id, planId);
    if (!review.ok) throw new Error("setup failed");
    await completeReview(ownerId, project.id, planId, review.id, {
      classification: "needs_professional_evaluation",
    });

    const created = await createEscalationSummary(ownerId, project.id, planId);
    expect(created.ok).toBe(true);
    if (!created.ok) return;

    const toReady = await updateEscalationSummary(ownerId, project.id, planId, created.id, { status: "ready" });
    expect(toReady.ok).toBe(true);
    if (toReady.ok) expect(toReady.summary.status).toBe("ready");

    const toExported = await updateEscalationSummary(ownerId, project.id, planId, created.id, {
      status: "exported",
    });
    expect(toExported.ok).toBe(true);
    if (toExported.ok) expect(toExported.summary.status).toBe("exported");

    const deleted = await deleteEscalationSummary(ownerId, project.id, planId, created.id);
    expect(deleted).toEqual({ ok: true });

    const detail = await getPlan(ownerId, project.id, planId);
    if (!detail.ok) throw new Error("unexpected");
    expect(detail.escalationSummaries[0]!.status).toBe("deleted");
  });

  it("AC-9（延伸）：ineffective／escalated 狀態下可透過既有調整端點回到 active", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "調整回到 active 測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const review = await createReview(ownerId, project.id, planId);
    if (!review.ok) throw new Error("setup failed");
    await completeReview(ownerId, project.id, planId, review.id, { classification: "possibly_ineffective" });

    const adjusted = await updatePlan(ownerId, project.id, planId, { title: "簡化後的運動計畫" });
    expect(adjusted.ok).toBe(true);
    if (!adjusted.ok) return;
    expect(adjusted.plan.status).toBe("active");
    expect(adjusted.plan.previousVersionId).toBe(planId);
  });

  it("AC-9（延伸）：ineffective 狀態下既有 pausePlan 端點不受影響（保持原本 INVALID_REQUEST 保護，非新增行為）", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "pausePlan 不受影響測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const review = await createReview(ownerId, project.id, planId);
    if (!review.ok) throw new Error("setup failed");
    await completeReview(ownerId, project.id, planId, review.id, { classification: "possibly_ineffective" });

    const paused = await pausePlan(ownerId, project.id, planId);
    expect(paused).toEqual({ ok: false, code: "INVALID_REQUEST" });
  });

  it("AC-10（四層權限鏈）：跨帳號操作檢討／轉介摘要一律拒絕", async () => {
    const ownerId = await seedUser();
    const otherId = await seedUser();
    const project = await createProject(ownerId, "四層鏈測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);

    const deniedReview = await createReview(otherId, project.id, planId);
    expect(deniedReview).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });

    const deniedSummary = await createEscalationSummary(otherId, project.id, planId);
    expect(deniedSummary).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
  });

  it("AC-12（日誌 P0）：建立／完成檢討與轉介摘要過程不將內容寫入日誌", async () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const planId = await createActiveDuePlan(ownerId, project.id);
    const marker = `plan4-log-marker-${randomUUID()}`;

    const review = await createReview(ownerId, project.id, planId);
    if (!review.ok) throw new Error("setup failed");
    await completeReview(ownerId, project.id, planId, review.id, {
      classification: "needs_professional_evaluation",
      notes: marker,
    });
    await createEscalationSummary(ownerId, project.id, planId);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain(marker);
    infoSpy.mockRestore();
  });
});
