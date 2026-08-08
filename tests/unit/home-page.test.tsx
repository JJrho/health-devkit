// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import HomePage from "@/app/page";

// Vitest 未啟用 globals，@testing-library/react 的自動 cleanup 偵測不到全域
// afterEach，需手動註冊，否則多個 it() 之間的 render() 會在同一份 jsdom
// document 累積（比照 tests/unit/deletion-guidance-notice.test.tsx 既有慣例）。
afterEach(cleanup);

// next/image 在 jsdom 下的用戶端行為（devicePixelRatio 偵測等）會在測試環境
// 拆卸後才觸發，產生「window is not defined」的非同步例外；比照 Next.js
// 官方測試建議，改用純 <img> 通過測試環境。
vi.mock("next/image", () => ({
  default: (props: Record<string, unknown>) => {
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    return <img {...props} />;
  },
}));

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

  it("渲染插圖區塊，alt text 有意義（E7-F2，16_HERO_V2_DESIGN.md）", () => {
    render(<HomePage />);
    const image = screen.getByRole("img", {
      name: "希波克拉底雕像，象徵醫者誓言與醫病信任",
    });
    expect(image).toBeDefined();
  });

  it("渲染具名推薦文字，逐字取自 16_HERO_V2_DESIGN.md §4（E7-F2）", () => {
    render(<HomePage />);
    expect(
      screen.getByText("本平台由「獅子座的王醫師（王健宇醫師）」與團隊共同發起。"),
    ).toBeDefined();
    expect(
      screen.getByText(
        "王醫師長期於《年代 MUCh 台灣健康好生活》節目分享正確醫療觀念，我們相信——好的醫病關係，永遠建立在信任之上。",
      ),
    ).toBeDefined();
  });
});
