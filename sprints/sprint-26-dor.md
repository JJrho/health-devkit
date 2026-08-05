# Sprint 26 DOR — E2-F5：原始掃描檔刪除引導提示

> 狀態：**✅ 通過（PO 已確認，2026-08-05）**
> 對應：E2-F5（05_BACKLOG E2 表，MVP 上線後追加）；SDD §4.4（文件上傳與預覽）
> 前置依賴：E2-F1（`deleteDocument()`）、E2-F3（人工確認鎖定）已完成
> 精簡說明：本輪為既有元件的文案＋UI 補充，不新增資料表／API／服務層邏輯，複雜度低，DOR 依既有精簡慣例撰寫。

---

## 1. 需求描述

`src/modules/documents/service.ts` 的 `deleteDocument()` 與對應 UI 刪除按鈕（`src/app/projects/[id]/documents/page.tsx`）已存在且可正常運作——刪除會清除 Storage 原始物件並軟刪除 `documents` 列，且**不影響已確認寫入 `observations` 的正式數值**（`observations.documentId` 雖以 FK 參照 `documents.id`，但刪除是軟刪除，不會級聯刪除 `observations`；已用 `src/modules/reports/data-export.ts` 原始碼核對確認：`observations` 匯出獨立於 `documents` 查詢，數值永遠會匯出，缺的只有原始檔案本身）。

問題不在功能缺失，而在**使用者不知道這個選項的意義**：使用者完成 E2-F3 人工確認、資料正式寫入 `observations` 之後，無從得知「這份含姓名等資訊的原始掃描檔，其實可以自己決定要不要繼續留著」。本輪只補一句提示文字＋一個導向既有刪除按鈕的連結，不新增或修改任何刪除邏輯本身。

## 2. 使用者角色

- 已完成人工確認的使用者：在文件列表看到自己已確認的報告時，被告知可以選擇刪除原始檔。

## 3. 操作流程

使用者於 `/projects/[id]/documents` 頁面完成某份文件的人工確認（`document.status` 轉為 `confirmed`）→ 該文件卡片新增一段提示文字，說明原始檔的保留用途與可自主刪除 → 提示內含一個可聚焦既有「刪除」按鈕的連結／按鈕（鍵盤可達）→ 使用者可選擇點擊既有刪除按鈕（沿用既有 `window.confirm` 二次確認），或忽略提示保留原始檔。

## 4. 輸出結果

- `DocumentRow` 元件（`src/app/projects/[id]/documents/page.tsx`）：`document.status === "confirmed"` 時，卡片內顯示一段提示區塊
- 提示文字大意：「原始掃描檔已保留，方便你之後核對數值或匯出使用；如果你不需要保留，可以隨時刪除。刪除後，之後的資料匯出將不會再包含這份原始檔案，但已確認的數值本身不受影響，會持續保留在你的健康紀錄裡。」
- 提示內含一個可聚焦（focus）既有刪除按鈕的連結／按鈕，非新增刪除路徑
- 不改動 `deleteDocument()`、`completeUpload()`、`data-export.ts` 或任何既有服務層邏輯

## 5. 驗收條件（Given／When／Then）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（提示顯示時機） | 文件狀態為 `confirmed` | 使用者開啟文件列表頁 | 該文件卡片顯示刪除引導提示 |
| AC-2（提示不干擾其他狀態） | 文件狀態非 `confirmed`（如 `uploading`／`processing`／`review_required`／`processing_failed`） | 使用者開啟文件列表頁 | 不顯示此提示（避免對尚未確認的文件建議刪除，數值都還沒正式入庫） |
| AC-3（連結可達） | 提示已顯示 | 使用者點擊提示內的連結／鍵盤 Tab 到達 | 焦點移至既有「刪除」按鈕，既有 `window.confirm` 二次確認流程不變 |
| AC-4（不影響既有刪除邏輯） | 任意文件狀態 | 使用者點擊既有刪除按鈕 | 行為與本輪修改前完全一致（`deleteDocument()` 未變動） |
| AC-5（無障礙） | 提示已顯示 | axe-core 掃描 `/projects/[id]/documents` | 無 Critical／Serious 違規（納入既有頁面回歸，非新增獨立頁面） |

## 6. 可能影響的舊功能

- `DocumentRow` 元件新增一個條件區塊，不影響既有 `預覽`／`查看解析結果`／`重新解析`／`刪除` 按鈕的既有行為
- 不觸碰 `deleteDocument()`、`data-export.ts`、`confirm` API 路由

## 7. 本任務可在一個 Sprint 內完成

是——純前端文案＋條件渲染，無新表、無新 API。

## 8. 範圍排除

- **不做自動刪除**：本輪明確不讓系統在確認完成後自動刪除原始檔。**理由**（PO 本輪拍板）：自動刪除會影響既有資料匯出功能（`data-export.ts` 目前會把仍存在的原始檔一併打包進 ZIP）與「數值可回溯原始報告」的產品原則（使用者未來若想重新核對原始報告、或想匯出留存，仍保有這個選項）；刪不刪除應該是使用者自主決定，不是系統代為決定，這與憲法 §3「未確認資料不入正式分析」同樣是「保守、使用者知情」的一貫精神。
- 不改動 `deleteDocument()` 既有邏輯（保留為使用者主動觸發的既有機制）
- 不做「已刪除原始檔」的視覺標記或統計（如「已刪除 N 份原始檔」），本輪僅止於提示與引導

## 9. 三層結構回溯

- Feature：**E2-F5**（新增於既有 Epic E2：健檢資料入庫管線，MVP 上線後追加，非原始 WBS 範圍）
- SDD：§4.4（文件上傳與預覽）
- 前置依賴：E2-F1（`deleteDocument()`）、E2-F3（人工確認）皆已完成
