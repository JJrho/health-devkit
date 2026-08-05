"use client";

/**
 * E2-F5：原始掃描檔刪除引導提示（sprints/sprint-26-dor.md）。
 * 僅於文件狀態為 confirmed 時由呼叫端渲染；不做自動刪除，
 * 決策依據見 09_KNOWLEDGE_BASE.md KB-038。
 */
export function DeletionGuidanceNotice({
  onFocusDeleteButton,
}: {
  onFocusDeleteButton: () => void;
}) {
  return (
    <p className="mt-4 rounded-lg border border-blue-200 bg-blue-50 p-4 text-base text-slate-800">
      原始掃描檔已保留，方便你之後核對數值或匯出使用；如果你不需要保留，可以
      <button
        type="button"
        onClick={onFocusDeleteButton}
        className="mx-1 font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
      >
        隨時刪除
      </button>
      。刪除後，之後的資料匯出將不會再包含這份原始檔案，但已確認的數值本身不受影響，會持續保留在你的健康紀錄裡。
    </p>
  );
}
