// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("首頁 smoke（Testing Library）", () => {
  it("渲染平台名稱與註冊／登入入口", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "個人健康檢查管理平台" }),
    ).toBeDefined();
    expect(screen.getByRole("link", { name: "建立帳號" })).toBeDefined();
    expect(screen.getByRole("link", { name: "登入" })).toBeDefined();
  });
});
