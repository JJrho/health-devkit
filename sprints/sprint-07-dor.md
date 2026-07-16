# Sprint 7 DOR — E2-F2：文字型 PDF 解析管線（PoC，1/2）

> 狀態：**✅ 通過（PO 2026-07-16：A22–A25 追認、DOR 通過）**
> 對應：E2-F2（05_BACKLOG E2 表，2 Sprint，本輪為第 1 個，🔴 PoC——表格抽取準確率為本案最大不確定性之一）；SDD §4.5、C4／C14；上游規格 §18.1（狀態機）、§22.4（端點）、§28.4（辨識規則）；憲法 §1／§3／§4
> 前置依賴：E2-F1 ✅（已部署；`documents`、`SupabaseStorageAdapter`、PG queue／Worker 基礎設施沿用 Sprint 1）
> 安全前置決策：**KB-022**（2026-07-16 討論定案）——本輪解析工作需自帶逐工作逾時／資源上限，惡意檔案掃描仍留 E6-F2（KB-021 不變）

---

## 1. 需求描述 ✅

**PoC 定位聲明**：本 Feature 精估 2 個 Sprint，本輪（Sprint 7）交付**可運作的端到端管線**（上傳完成→自動排入解析→Worker 抽取→信心值分級→可查看結果），**不承諾抽取準確率已達生產可用水準**——這正是把它標記 🔴 PoC 的原因。準確率調校、邊界案例處理視本輪實測結果決定是否需要 Sprint 8（比照 E1-F1／E4-F3 的 PoC×2 模式，兩個 Sprint 各自獨立 DOR）。

六項交付：

1. **DB migration**：`extracted_items` 表——`document_id` FK、`raw_test_name`／`raw_value`／`raw_unit`／`raw_reference_range`（皆 text，未確認資料不落 `numeric`，憲法 §4：健康數值須用 numeric 但那是給**已確認**紀錄用，本輪抽取結果仍是候選、原樣保留文字）、`confidence`（real，0–1）、`page_number`（integer）、`coordinates`（jsonb，`{x,y,width,height}`，憲法 §4 座標型別規則）、`status`（text，本輪僅寫入 `extracted`／`low_confidence`，`edited`/`accepted`/`rejected` 是 E2-F3 的事）、`version`、時間戳。無 `deleted_at`——這些是解析候選列，`reprocess` 時整批硬刪重建，尚未進入「正式紀錄」語意（那是 E2-F4 `observations` 的事）。可回滾。
2. **自動觸發**：擴充 E2-F1 既有的 `completeUpload`——成功轉 `uploaded` 後緊接著 enqueue 解析工作（`type: "parse-document"`，PG queue，沿用 Sprint 1 `QueueAdapter`）並將 `documents.status` 轉 `processing`（狀態機 §18.1 既定路徑）。
3. **Worker 解析 handler**（`parse-document`，註冊進 `src/worker/job-handlers.ts`）：
   - 從 Storage 讀回文件（`StorageAdapter.getObject`）
   - 用 `pdfjs-dist`（既有技術選型，Sprint 1 已定案給前端預覽用，本輪首次搬到伺服器端做文字＋座標抽取）逐頁取出文字項目與其座標
   - 依座標分組成「列」，用正則式／欄位順序啟發式判斷是否符合「項目名稱｜數值｜單位｜參考區間」的檢驗報告列型態
   - 依匹配完整度計算信心值；`>= 0.85`（C14）寫入 `status=extracted`，否則 `status=low_confidence`
   - 全部完成後：`documents.status = review_required`；解析失敗（例外／零筆匹配）：`status = processing_failed`
   - **KB-022 安全防線**：整個解析呼叫包一層逾時（設定值，草案 60 秒）；逾時視同失敗，不讓惡意構造的 PDF 卡死 Worker 或拖垮後續其他工作
4. **API 路由**（本輪僅讀取＋重觸發，CRUD／確認屬 E2-F3）：
   - `GET /api/projects/{id}/documents/{documentId}/extractions`：列出該文件的抽取候選列（沿用 `findOwnedDocument` 四層鏈）
   - `POST /api/projects/{id}/documents/{documentId}/reprocess`：清空既有候選列、重新 enqueue（上游 §22.3 既定端點，本輪才真正落地其用途）
5. **UI**：文件頁（E2-F1 既有）新增唯讀「解析結果」區塊——顯示每個候選列的項目/數值/單位/參考區間/信心值/所在頁碼，**不提供編輯或確認**（E2-F3 範圍）；本輪存在的唯一目的是讓 PO 能實際看到 PoC 準確率，不是正式功能。`processing`／`review_required`／`processing_failed` 狀態需在文件列表可視化。
6. **測試**：四類齊備＋PoC 準確率記錄（非自動化斷言，是本輪驗收會議要看的實測樣本結果）＋逾時防線的直接測試（模擬拖長解析時間，驗證 Worker 確實逾時失敗而非卡死）＋四層鏈重用測試。

## 2. 使用者角色 ✅

**終端使用者（本人）**，已驗證（延續 C6：上傳已鎖到驗證完成，解析是上傳的自動後續，同一使用者範圍）。

## 3. 操作流程 ✅

使用者完成上傳（E2-F1）→ 系統自動排入解析、文件狀態顯示「處理中」→ Worker 完成後狀態轉「待確認」，唯讀顯示抽取結果供使用者/PO 檢視信心值與位置 → （下一 Feature）使用者才能真正編輯確認。

## 4. 輸入資料 ✅

| 輸入 | 來源 | 狀態 |
|---|---|---|
| `documents`／`SupabaseStorageAdapter`／`QueueAdapter`／Worker 基礎設施 | E2-F1／Sprint 1 已完成 | ✅ |
| 真實健檢報告 PDF 樣本（供 PoC 準確率評估） | PO 提供或公開範本 | 🔶（本輪需要至少數份真實或高度擬真樣本，否則準確率評估沒有意義，見第 11 節假設） |
| `pdfjs-dist` 伺服器端文字＋座標抽取可行性 | 待驗證 | 🔶（PoC 核心不確定性之一，見第 11 節） |

## 5. 輸出結果 ✅

§1 六項交付；完成後健檢 PDF 上傳完成即自動解析，使用者可看到抽取候選與信心值分級，惡意構造檔案不會卡死解析管線。**不保證**抽取準確率已達可直接信賴的水準——這是下一輪（若需要）才收斂的事。

## 6. 驗收條件（Given／When／Then）✅

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | 文件上傳完成（`uploaded`） | 系統自動觸發 | `documents.status` 依序轉 `processing` → `review_required`（或 `processing_failed`），Worker 排程可見 |
| AC-2 | 真實／擬真健檢報告 PDF，含清楚的項目/數值/單位/參考區間列 | 解析完成 | 該列被正確抽取，`confidence >= 0.85`，`status=extracted`，`page_number`／`coordinates` 可回查原頁對應位置 |
| AC-3 | 同上，但某列格式模糊（缺單位或數值格式不標準） | 解析完成 | 該列仍被抽取但 `confidence < 0.85`，`status=low_confidence`（C14） |
| AC-4 | 無法解析的 PDF（如純掃描影像、無文字層——C4 範圍外） | 解析 | `status=processing_failed`，不崩潰、不誤植假資料 |
| AC-5（KB-022 安全防線，本輪關鍵） | 構造刻意拖長解析時間或觸發極端迴圈的 PDF | 解析執行超過逾時上限 | 工作視同失敗（`processing_failed`），Worker 於逾時後恢復輪詢、繼續處理佇列中其他工作，不被單一工作卡死 |
| AC-6 | 自己名下專案 A、B；文件與抽取結果存在 A 底下 | 用 B 的 project_id 查該文件的 extractions | 回 `PROJECT_ACCESS_DENIED`（四層鏈重用 `findOwnedDocument`，非本輪新增判斷邏輯） |
| AC-7 | 已有抽取結果（可能是失敗或想重跑） | 呼叫 reprocess | 舊候選列清空、重新 enqueue、狀態回 `processing` |
| AC-8 | 全程（含抽取到的真實檢驗數值／項目名稱） | 掃描日誌＋跑 a11y 檢查 | 日誌不含任何抽取內容（比 E1-F5 的背景資料、E2-F1 的檔名更直接是健康數值本身，P0 中的 P0）；解析結果區塊鍵盤可瀏覽 |
| AC-9（記錄，非自動化斷言） | 本輪蒐集的樣本 PDF 集合 | 全數跑過解析 | 記錄整體準確率／常見失敗型態，作為是否需要 Sprint 8、以及 Sprint 8 該聚焦什麼的依據 |

## 7. Clarify 釐清 ✅

C4、C14 已定案，無新增。信心值計算公式（正則式匹配完整度啟發式）屬本輪 PoC 設計細節，非規格未決事項——若 Sprint 8 發現需要調整權重／規則，屬正常 PoC 迭代。

## 8. 可能影響的舊功能 ✅

- **修改 E2-F1 已上線程式碼**：`src/modules/documents/service.ts` 的 `completeUpload` 需新增「成功後 enqueue＋轉 processing」邏輯；這是預期中的迭代擴充，不是回歸，但需重跑 E2-F1 既有測試確認未破壞（AC-1～AC-11 不得回歸）
- `src/worker/job-handlers.ts`：新增 `parse-document` handler，`src/worker/main.ts` 的 `tick()` 目前對 handler 呼叫沒有任何逾時包裝（KB-022 發現的既有缺口）——本輪需要為此新增一個可重用的「逾時包裝」機制，未來其他長時間工作類型（如未來的 AI 摘要）也能沿用
- `documents.status` 首次真正用到 `processing`／`review_required`／`processing_failed` 這三個值（E2-F1 設計時已刻意用 plain text column 保留擴充空間，本輪驗證這個設計選擇是對的，無需 schema migration 即可擴充狀態）

## 9. 一個 Sprint 內可完成 ✅

Backlog 精估本 Feature 共 2 個 Sprint；本輪（Sprint 7）範圍已明確收斂為「管線跑得通＋信心分級＋逾時防線」，不含準確率調校到生產水準、不含人工編輯 UI——這正是拆成兩輪的意義。

## 10. 範圍排除 ✅

- **人工編輯／確認 CRUD、確認入庫 transaction**——E2-F3
- **標準化、單位換算、正式紀錄版本鏈**——E2-F4
- **掃描 OCR**——C4 已定案 feature flag 延後，本輪僅文字層 PDF
- **抽取準確率調校到生產水準**——視本輪 PoC 實測結果，可能需要 Sprint 8（另立 DOR，不在本輪範圍內預先承諾內容）
- **惡意檔案掃描（AV/訊號比對）**——KB-021 維持不變，留 E6-F2；本輪只做逾時／資源上限（KB-022），兩者不是同一件事，不互相取代
- **趨勢頁／dashboard 的「未確認資料不顯示」實際過濾邏輯**——E3 範圍；本輪透過「抽取候選與正式 `observations` 是不同表」的架構設計天然滿足此鐵則（不存在需要額外過濾的中間態），但顯示邏輯本身待 E3 實作

## 11. 假設登記（待 PO 追認）

- **A22**：伺服器端使用 `pdfjs-dist` 做文字＋座標抽取（沿用既有技術選型，不新增 PDF 函式庫）；此庫在 Node（無瀏覽器 DOM）環境下的相容性屬本輪待驗證的 PoC 核心風險之一，若證實不可行需评估替代方案（如 `pdf-parse`、`unpdf` 等），屬正常 PoC 探索範圍，不預先假設一定成功。
- **A23**：信心值計算採**正則式／欄位順序啟發式**（非 ML／OCR 信心值），依「項目名稱/數值/單位/參考區間」四段是否皆清楚匹配决定分數；具體規則與權重為實作細節，Sprint 8（若需要）可依實測調整，不視為需要重新走 Clarify 的規格變更。
- **A24**：本輪需要 PO 提供或協助取得**真實或高度擬真的健檢報告 PDF 樣本**（建議至少 3–5 份、涵蓋不同院所格式），否則準確率評估失去意義——本輪不使用憑空捏造的測試資料代表真實準確率結論。
- **A25（KB-022 落地）**：解析工作逾時上限草案訂為 **60 秒**，逾時即失敗；此為設定值，Sprint 8 若發現合理 PDF 需要更長時間可調整，但預設值需保守（寧可誤判合理檔案逾時，也不讓惡意檔案卡死 Worker）。

## 12. 三層結構回溯 ✅

- Feature：**E2-F2**（E2 健檢資料入庫管線，2/4；PoC，本輪為 1/2）
- SDD：§4.5；C4／C14；KB-022（安全前置決策）
- 前置依賴：E2-F1 ✅

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」適用但為**重用**既有 `findOwnedDocument`（AC-6），非新增層級；「日誌掃描」為本輪 **P0 中的 P0**（AC-8，抽取內容是最直接的健康數值本身，比先前任何模組都更貼近憲法 §3／§4 的核心紅線）；「LLM Streaming」N/A（本輪不涉及 LLM）。**本輪額外要求**：AC-9（準確率記錄）需在 SPRINT_LOG 具體寫下實測數字與觀察，作為是否開 Sprint 8、以及 Sprint 8 範圍的決策依據——不能只寫「測試通過」帶過 PoC 的核心產出。
