// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { DeletionGuidanceNotice } from "@/components/documents/deletion-guidance-notice";

// Vitest 未啟用 globals，@testing-library/react 的自動 cleanup 偵測不到全域 afterEach，
// 需手動註冊，否則多個 it() 之間的 render() 會在同一份 jsdom document 累積。
afterEach(cleanup);

/**
 * E2-F5：原始掃描檔刪除引導提示（sprints/sprint-26-dor.md AC-1/AC-3）。
 * `DocumentRow`（src/app/projects/[id]/documents/page.tsx）是 Next.js App Router
 * page.tsx 內的私有元件，無法具名匯出（page.tsx 僅允許 default/metadata 等固定
 * 匯出，具名匯出會讓 `next build` 的路由型別檢查失敗）——條件渲染時機
 * （AC-2：非 confirmed 不顯示）改以本機瀏覽器人工驗證確認，見 07_SPRINT_LOG。
 * 本測試改針對抽出的獨立元件 DeletionGuidanceNotice 驗證文案與互動邏輯。
 */
describe("DeletionGuidanceNotice 刪除引導提示（E2-F5）", () => {
  it("AC-1：顯示提示文字，說明保留用途與刪除後果", () => {
    render(<DeletionGuidanceNotice onFocusDeleteButton={vi.fn()} />);
    expect(screen.getByText(/原始掃描檔已保留/)).toBeDefined();
    expect(screen.getByText(/刪除後，之後的資料匯出將不會再包含這份原始檔案/)).toBeDefined();
  });

  it("AC-3：點擊「隨時刪除」呼叫 onFocusDeleteButton（父層以此聚焦既有刪除按鈕）", () => {
    const onFocusDeleteButton = vi.fn();
    render(<DeletionGuidanceNotice onFocusDeleteButton={onFocusDeleteButton} />);
    fireEvent.click(screen.getByRole("button", { name: "隨時刪除" }));
    expect(onFocusDeleteButton).toHaveBeenCalledOnce();
  });
});
