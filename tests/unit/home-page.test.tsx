// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("首頁 smoke（Testing Library）", () => {
  it("渲染 Hero 標題與註冊／登入入口（E7-F1，14_PUBLIC_SITE_COPY.md 頁 4/5）", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "把多年健檢報告，變成看得懂的健康紀錄" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "建立帳號" })).toBeDefined();
    expect(screen.getByRole("link", { name: "登入" })).toBeDefined();
  });

  it("渲染三個信任區塊連往 /privacy /scope /ai-principles", () => {
    render(<HomePage />);
    const hrefs = screen.getAllByRole("link").map((link) => link.getAttribute("href"));
    expect(hrefs).toContain("/privacy");
    expect(hrefs).toContain("/scope");
    expect(hrefs).toContain("/ai-principles");
  });
});
