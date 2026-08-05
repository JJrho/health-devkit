import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

/**
 * E6-F2（AC-9，A148）：工作區頁面採 6 個代表性頁面抽查，非逐頁全站稽核。
 * 本專案十個工作區頁面共用同一套 UI 元件庫，代表性頁面通過即高機率其餘頁面
 * 因元件重用一致合格（見 sprints/sprint-24-dor.md A148 理由）。
 * E7-F1（AC-4，sprints/sprint-25-dor.md）：公開站五頁全數納入（非抽查），
 * 因頁數少、皆未登入可直接訪問，逐頁稽核成本低。
 * 僅檢查 WCAG 2.1/2.2 A／AA 等級違規（critical／serious／moderate 皆回報，
 * 但僅 critical／serious 視為未通過）。
 */
const FAILING_IMPACTS = new Set(["critical", "serious"]);

async function auditPage(page: import("@playwright/test").Page, url: string) {
  await page.goto(url);
  const results = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa"])
    .analyze();
  const failing = results.violations.filter((v) => FAILING_IMPACTS.has(v.impact ?? ""));
  return { violations: results.violations, failing };
}

test.describe("無障礙抽查（AC-9）", () => {
  test("首頁", async ({ page }) => {
    const { failing, violations } = await auditPage(page, "/");
    expect(failing, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("註冊頁", async ({ page }) => {
    const { failing, violations } = await auditPage(page, "/register");
    expect(failing, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("登入頁", async ({ page }) => {
    const { failing, violations } = await auditPage(page, "/login");
    expect(failing, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("隱私與資料安全頁（E7-F1）", async ({ page }) => {
    const { failing, violations } = await auditPage(page, "/privacy");
    expect(failing, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("能做什麼・不能做什麼頁（E7-F1）", async ({ page }) => {
    const { failing, violations } = await auditPage(page, "/scope");
    expect(failing, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("產品說明頁（E7-F1）", async ({ page }) => {
    const { failing, violations } = await auditPage(page, "/about");
    expect(failing, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("來源與 AI 原則頁（E7-F1）", async ({ page }) => {
    const { failing, violations } = await auditPage(page, "/ai-principles");
    expect(failing, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("專案列表（需登入）", async ({ page }) => {
    const email = process.env.A11Y_TEST_EMAIL;
    const password = process.env.A11Y_TEST_PASSWORD;
    test.skip(!email || !password, "需先用 scripts/tmp-* 建立測試帳號並設定 A11Y_TEST_EMAIL/PASSWORD");

    const loginRes = await page.request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(loginRes.ok()).toBe(true);

    const { failing, violations } = await auditPage(page, "/projects");
    expect(failing, JSON.stringify(violations, null, 2)).toEqual([]);
  });

  test("戰情頁與計畫頁（需登入＋既有專案）", async ({ page }) => {
    const email = process.env.A11Y_TEST_EMAIL;
    const password = process.env.A11Y_TEST_PASSWORD;
    const projectId = process.env.A11Y_TEST_PROJECT_ID;
    test.skip(
      !email || !password || !projectId,
      "需先用 scripts/tmp-* 建立測試帳號＋專案並設定 A11Y_TEST_* 環境變數",
    );

    const loginRes = await page.request.post("/api/auth/login", {
      data: { email, password },
    });
    expect(loginRes.ok()).toBe(true);

    const dashboard = await auditPage(page, `/projects/${projectId}`);
    expect(dashboard.failing, JSON.stringify(dashboard.violations, null, 2)).toEqual([]);

    const plans = await auditPage(page, `/projects/${projectId}/plans`);
    expect(plans.failing, JSON.stringify(plans.violations, null, 2)).toEqual([]);

    const chat = await auditPage(page, `/projects/${projectId}/chat`);
    expect(chat.failing, JSON.stringify(chat.violations, null, 2)).toEqual([]);
  });
});
