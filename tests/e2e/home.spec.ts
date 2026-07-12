import { expect, test } from "@playwright/test";

/**
 * AC-2（Sprint 2）＋首頁入口（Sprint 3）：200、渲染、無 console error。
 */
test("首頁 smoke", async ({ page }) => {
  const consoleErrors: string[] = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });

  const response = await page.goto("/");
  expect(response?.status()).toBe(200);

  await expect(
    page.getByRole("heading", { name: "個人健康檢查管理平台" }),
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "建立帳號" })).toBeVisible();
  await expect(page.getByRole("link", { name: "登入" })).toBeVisible();

  expect(consoleErrors).toEqual([]);
});
