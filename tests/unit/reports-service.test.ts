import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import AdmZip from "adm-zip";
import { getDb, closePool } from "@/db/client";
import { users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import { upsertProfile } from "@/modules/profiles";
import {
  activatePlan,
  addMetric,
  completeReview,
  createPlan,
  createReview,
} from "@/modules/plans";
import { buildVisitSummary, exportProjectData } from "@/modules/reports";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E5-F4 整合測試（Sprint 22，AC-1～AC-8；連實庫）。
 * 看診摘要（C19）為即時彙整，不落地儲存（A128）；資料匯出（C20）為單一專案 ZIP（A130）。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `report-${id}@projects.test.invalid` });
  return id;
}

async function createActivePlanWithMetric(ownerId: string, projectId: string) {
  const created = await createPlan(ownerId, projectId, {
    title: "運動計畫",
    baseline: "目前每週活動 0 次",
    riskNote: "無已知心血管疾病",
    stopCondition: "出現胸悶或異常呼吸困難立即停止",
    referralCondition: "疼痛持續超過一週",
    reviewDate: new Date("2026-07-01"),
  });
  if (!created.ok) throw new Error("setup failed");
  await addMetric(ownerId, projectId, created.planId, "leading", "每週活動次數");
  await addMetric(ownerId, projectId, created.planId, "outcome", "體重");
  await addMetric(ownerId, projectId, created.planId, "safety", "新的或加重的疼痛");
  const activated = await activatePlan(ownerId, projectId, created.planId);
  if (!activated.ok) throw new Error("setup failed to activate");
  return created.planId;
}

async function streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

describe.skipIf(!hasDb)("reports module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("report-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1（看診摘要產生成功）：勾選全部區塊 → 回傳含所選區塊資料", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "看診摘要測試專案");
    await upsertProfile(ownerId, project.id, { 慢性病史: "無" }, undefined);
    await createActivePlanWithMetric(ownerId, project.id);

    const result = await buildVisitSummary(ownerId, project.id, {
      sections: { background: true, trends: true, plans: true, symptoms: true, questions: true },
      question: "最近運動會喘，正常嗎？",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.background).toEqual({ 慢性病史: "無" });
    expect(result.data.plans).toHaveLength(1);
    expect(result.data.plans![0]!.title).toBe("運動計畫");
    expect(result.data.question).toBe("最近運動會喘，正常嗎？");
  });

  it("AC-2（看診摘要範圍可勾選）：僅勾選部分區塊 → 未勾選欄位不出現", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "看診摘要局部測試專案");
    await upsertProfile(ownerId, project.id, { 慢性病史: "無" }, undefined);

    const result = await buildVisitSummary(ownerId, project.id, {
      sections: { background: true, trends: false, plans: false, symptoms: false, questions: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.background).toBeDefined();
    expect(result.data.trends).toBeUndefined();
    expect(result.data.plans).toBeUndefined();
    expect(result.data.symptoms).toBeUndefined();
    expect(result.data.question).toBeUndefined();
  });

  it("AC-3（看診摘要無資料情境）：勾選但無資料 → 回傳空陣列，非出錯", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "看診摘要空資料測試專案");

    const result = await buildVisitSummary(ownerId, project.id, {
      sections: { background: false, trends: false, plans: true, symptoms: true, questions: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.data.plans).toEqual([]);
    expect(result.data.symptoms).toEqual([]);
  });

  it("AC-4（銜接 E5-F3）：計畫有「需要專業評估」的已完成檢討 → 附註提示並帶出轉介摘要內容", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "看診摘要銜接檢討測試專案");
    const planId = await createActivePlanWithMetric(ownerId, project.id);

    // 檢討日已過去，直接補一筆過去日期的計畫供 createReview 判定已達檢討日
    const pastPlan = await createPlan(ownerId, project.id, {
      title: "已達檢討日計畫",
      baseline: "基準",
      riskNote: "風險",
      stopCondition: "停止條件",
      referralCondition: "轉介條件",
      reviewDate: new Date("2020-01-01"),
    });
    if (!pastPlan.ok) throw new Error("setup failed");
    await addMetric(ownerId, project.id, pastPlan.planId, "leading", "領先指標");
    await addMetric(ownerId, project.id, pastPlan.planId, "outcome", "結果指標");
    await addMetric(ownerId, project.id, pastPlan.planId, "safety", "安全指標");
    const activated = await activatePlan(ownerId, project.id, pastPlan.planId);
    if (!activated.ok) throw new Error("setup failed to activate");

    const review = await createReview(ownerId, project.id, pastPlan.planId);
    if (!review.ok) throw new Error("setup failed to create review");
    await completeReview(ownerId, project.id, pastPlan.planId, review.id, {
      classification: "needs_professional_evaluation",
      notes: "執行三週未見改善",
    });

    const result = await buildVisitSummary(ownerId, project.id, {
      sections: { background: false, trends: false, plans: true, symptoms: false, questions: false },
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const flagged = result.data.plans!.find((p) => p.id === pastPlan.planId);
    expect(flagged).toBeDefined();
    expect(flagged!.needsProfessionalEvaluation).toBe(true);

    void planId; // 確保第一份計畫已建立但不影響本測試斷言
  });

  it("AC-5／AC-6（資料匯出成功且 JSON 結構完整）：ZIP 含 data.json／trends.csv，JSON 涵蓋 profile／plans", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "資料匯出測試專案");
    await upsertProfile(ownerId, project.id, { 慢性病史: "無" }, undefined);
    await createActivePlanWithMetric(ownerId, project.id);

    const result = await exportProjectData(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.filename).toContain("匯出.zip");

    const buffer = await streamToBuffer(result.archive);
    const zip = new AdmZip(buffer);
    const entryNames = zip.getEntries().map((e) => e.entryName);
    expect(entryNames).toContain("data.json");
    expect(entryNames).toContain("trends.csv");

    const dataJson = JSON.parse(zip.readAsText("data.json"));
    expect(dataJson.profile.data).toEqual({ 慢性病史: "無" });
    expect(dataJson.plans).toHaveLength(1);
    expect(dataJson.plans[0].plan.title).toBe("運動計畫");
  });

  it("AC-7（資料匯出空資料不整體失敗）：專案無任何計畫 → data.json 的 plans 為空陣列，整體仍成功", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "資料匯出空計畫測試專案");

    const result = await exportProjectData(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const buffer = await streamToBuffer(result.archive);
    const zip = new AdmZip(buffer);
    const dataJson = JSON.parse(zip.readAsText("data.json"));
    expect(dataJson.plans).toEqual([]);
    expect(dataJson.documents).toEqual([]);
  });

  it("AC-8（四層權限鏈）：跨帳號存取兩個功能一律拒絕", async () => {
    const ownerId = await seedUser();
    const otherId = await seedUser();
    const project = await createProject(ownerId, "四層鏈測試專案");

    const summaryResult = await buildVisitSummary(otherId, project.id, {
      sections: { background: true, trends: false, plans: false, symptoms: false, questions: false },
    });
    expect(summaryResult).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });

    const exportResult = await exportProjectData(otherId, project.id);
    expect(exportResult).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
  });

  it("AC-10（日誌 P0）：產生看診摘要與匯出過程不將健康內容或自由文字問題寫入日誌", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const marker = `report-log-marker-${randomUUID()}`;
    await upsertProfile(ownerId, project.id, { 備註: marker }, undefined);

    await buildVisitSummary(ownerId, project.id, {
      sections: { background: true, trends: false, plans: false, symptoms: false, questions: true },
      question: marker,
    });
    await exportProjectData(ownerId, project.id);

    const allOutput = spy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(allOutput).not.toContain(marker);
    spy.mockRestore();
  });
});
