// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

describe("首頁 smoke（Testing Library）", () => {
  it("渲染平台名稱與骨架狀態", () => {
    render(<HomePage />);
    expect(
      screen.getByRole("heading", { name: "個人健康檢查管理平台" }),
    ).toBeDefined();
    expect(screen.getByTestId("skeleton-status").textContent).toContain(
      "專案骨架運行中",
    );
  });
});
