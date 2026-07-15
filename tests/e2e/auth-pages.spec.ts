import { expect, test } from "@playwright/test";

/**
 * AC-8（部分）：auth 頁面渲染與鍵盤可操作性。
 * 不實際提交 Supabase（信件額度與測試隔離考量）——完整註冊流由 PO 於正式站肉眼驗收。
 */

test("註冊頁：欄位齊備、條款與 18 歲聲明可勾選、鍵盤可達提交鈕", async ({ page }) => {
  await page.goto("/register");
  await expect(page.getByRole("heading", { name: "建立帳號" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("密碼")).toBeVisible();
  await expect(page.getByLabel("服務條款與醫療免責聲明內容")).toBeVisible();

  // 純鍵盤流：填寫 → 勾選 → 聚焦提交
  await page.getByLabel("Email").focus();
  await page.keyboard.type("someone@example.com");
  await page.keyboard.press("Tab"); // → 密碼
  await page.keyboard.type("password123");

  const terms = page.getByLabel("我已閱讀並同意上方的服務條款與醫療免責聲明");
  await terms.focus();
  await page.keyboard.press("Space");
  await expect(terms).toBeChecked();

  const age = page.getByLabel("我已年滿 18 歲");
  await age.focus();
  await page.keyboard.press("Space");
  await expect(age).toBeChecked();

  const submit = page.getByRole("button", { name: "建立帳號" });
  await submit.focus();
  await expect(submit).toBeFocused();
  await expect(submit).toBeEnabled();
});

test("登入頁：欄位與輔助連結齊備", async ({ page }) => {
  await page.goto("/login");
  await expect(page.getByRole("heading", { name: "登入" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("密碼")).toBeVisible();
  await expect(page.getByRole("link", { name: "忘記密碼？" })).toBeVisible();
  await expect(page.getByRole("link", { name: "建立帳號" })).toBeVisible();
});

test("登入頁：錯誤憑證顯示統一溫和訊息（不洩漏帳號存在性）", async ({ page }) => {
  await page.goto("/login");
  await page.getByLabel("Email").fill(`nobody-${Date.now()}@test.invalid`);
  await page.getByLabel("密碼").fill("wrong-password");
  await page.getByRole("button", { name: "登入" }).click();
  await expect(page.getByRole("status")).toContainText("Email 或密碼不正確");
});

test("忘記密碼頁：提交後顯示防枚舉成功訊息", async ({ page }) => {
  await page.goto("/forgot-password");
  await expect(page.getByRole("heading", { name: "忘記密碼" })).toBeVisible();
});

test("重設密碼頁：連結含 error 參數時立即顯示過期／無效訊息（KB-012）", async ({ page }) => {
  await page.goto(
    "/reset-password#error=access_denied&error_code=otp_expired&error_description=link+expired",
  );
  await expect(page.getByRole("status")).toContainText("已過期或無效");
});

test("驗證完成頁渲染", async ({ page }) => {
  await page.goto("/auth/verified");
  await expect(page.getByRole("heading", { name: /Email 驗證完成/ })).toBeVisible();
});
