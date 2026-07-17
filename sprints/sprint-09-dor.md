# Sprint 9 DOR — E2-F3：人工確認與入庫模組

> 狀態：**✅ 通過（PO 2026-07-17：A36–A39 追認、DOR 通過）**
> 對應：E2-F3（05_BACKLOG E2 表，🟡 風險、非 PoC、精估 1 個 Sprint）；SDD §4.5；上游規格 §17／§18.1／§22.4／§28.4／§29（archive/upstream_spec/個人健康檢查管理平台_規格_v1_0_0.md）；憲法 §3／§4
> 前置依賴：E2-F2（PoC 1/2＋2/2）✅ 已 commit＋push＋正式站部署驗證通過

---

## 0. 文件基礎已修復

上一版草稿曾指出 `archive/` 底下的上游規格全文長期缺失（懸空引用）。2026-07-17 已找到並補齊：PO 提供了完整版 `個人健康檢查管理平台_規格_v1_0_0.md`／`個人健康檢查平台_技術選型_v1_0_0.md`，現存於 `archive/upstream_spec/`（詳見 09_KNOWLEDGE_BASE.md KB-027）。本輪 DOR 已依原文重寫，§17／§18.1／§22.4／§28.4／§29 皆為逐字查證後的內容，不再是本輪自行猜測。

## 1. 需求描述 ✅

**範圍定位**：E2-F2 產出的 `extracted_items` 目前全部是「未確認候選」（憲法 §3：「Unconfirmed extracted data MUST NOT enter official records, trends, or AI context」）。E2-F3 職責是讓使用者對這些候選**新增、修改、刪除**（上游 §28.4 原文），並執行「確認」動作，把文件狀態從 `review_required` 轉為 `confirmed`（上游 §18.1 狀態機）。

**E2-F3／E2-F4 邊界**（依上游 §17「主要物件、CRUD 與狀態」表）：
- 「辨識項目」（`extracted_items`）：建立＝自動或手動新增；修改＝數值、單位、名稱；刪除＝刪除／拒絕；狀態＝`extracted、low_confidence、edited、accepted、rejected`——**這就是 E2-F3 的範圍**。
- 「正式檢驗紀錄」（`observations`）：建立＝**由確認建立**；修改＝新版本；狀態＝`active、superseded、deleted`——這是 E2-F4 的範圍。「由確認建立」意指 E2-F3 的確認動作是 E2-F4 標準化管線的**觸發前提**，不代表 E2-F3 本身要建立 `observations` 表或做別名／單位標準化（那需要 E2-F4 的別名對應與單位換算邏輯，本輪尚未存在）。

六項交付：

1. **DB migration**：
   - `extracted_items.status` 擴充可寫入值（上游 §17 逐字確認）：`edited`、`accepted`、`rejected`。
   - 新增 `extracted_item_edits` 表（append-only 異動歷史）：`id`、`extracted_item_id`（FK）、`previous_raw_test_name`／`previous_raw_value`／`previous_raw_unit`／`previous_raw_reference_range`、`edited_at`。每次編輯前，先把**當時**的欄位值寫入這張表，再更新 `extracted_items` 本體——落實上游 §28.4「確認後有版本紀錄」與憲法 §4「Original values … MUST be preserved forever; edits create new versions」（A36，實作機制為本輪設計，上游未給出資料庫層級細節）。
   - `documents.status` 新增可寫入值：`confirmed`（上游 §18.1 狀態機）。
2. **API 路由**（依上游 §22.4 原文端點，僅路徑前綴依本專案既有慣例調整為 `/api/projects/...` 而非上游示意的 `/api/v1/projects/...`，沿用既有慣例不變更既有路由風格）：
   - `POST /api/projects/{id}/documents/{documentId}/extractions`：**手動新增**一筆候選列（上游 §28.4「可新增」；對應 AI 漏掉某列檢驗數據的情境），`status` 直接為 `accepted`（使用者手動輸入視同已確認正確，不需要再經 AI 信心值流程）。
   - `PATCH /api/projects/{id}/documents/{documentId}/extractions/{extractionId}`：編輯／狀態變更合一——可修改 `rawTestName`／`rawValue`／`rawUnit`／`rawReferenceRange`（觸發 `extracted_item_edits` 記錄＋`status→edited`），或單純變更 `status` 為 `accepted`／`rejected`（不觸發歷史記錄，因無欄位變更）。帶 `version` 做樂觀鎖，衝突回 `VERSION_CONFLICT`。
   - `DELETE /api/projects/{id}/documents/{documentId}/extractions/{extractionId}`：刪除候選列（上游 §28.4「可刪除」）。與「拒絕」（PATCH status=rejected）不同：DELETE 用於徹底移除（如手動新增後反悔、或明顯雜訊不需要留存紀錄），拒絕則保留列本身供日後回查（A37）。
   - `POST /api/projects/{id}/documents/{documentId}/confirm`：確認 transaction——要求該文件底下所有候選列狀態皆已是 `edited`／`accepted`／`rejected`（不得有 `extracted`／`low_confidence` 殘留，A38），成功後 `documents.status` 轉 `confirmed`。
3. **UI**：把 E2-F2 唯讀的「解析結果」表格改為可互動——每列可編輯欄位、可標記接受／拒絕、可刪除；新增「手動新增一列」表單；**回查原頁**：點擊候選列時在文件預覽（沿用 E2-F1 的 signed URL 預覽機制）上標示對應頁碼與座標區域；全部列都處理完後才能按下「確認」。
4. **四層鏈重用**：所有新端點沿用既有 `findOwnedDocument`。
5. **KB-021 重新檢查**（05_BACKLOG §49 footnote 明確要求）：本輪需要 PO 就惡意檔案掃描缺口是否提前處理做出明確決定（AC-11）。
6. **測試**：四類齊備＋四層鏈重用測試。因 KB-023 已記錄真實文字層樣本極度稀少，測試策略比照 Sprint 8，以合成 `extracted_items` 種子資料直接寫入 DB 驗證邏輯，不依賴新的真實樣本（A39）。

## 2. 使用者角色 ✅

同 E2-F1／E2-F2：**終端使用者（本人）**，已驗證（延續 C6）。

## 3. 操作流程 ✅

使用者開啟 `review_required` 狀態的文件 → 展開解析結果 → 逐列檢視（可回查原頁對照）→ 對每列編輯／接受／拒絕／刪除；若 AI 漏掉某列可手動新增 → 全部列都有明確狀態後，「確認」按鈕才會啟用 → 按下確認，文件轉為 `confirmed` → （下一 Feature）E2-F4 讀取這些候選做標準化。

依上游 §18.1，`confirmed → review_required` 是合法狀態轉換（並非本輪要實作的功能，但既有的 `reprocessDocument`——E2-F2 已完成——理當可以沿用在已確認文件上，讓文件轉回 `processing → review_required`，不需要額外新增「取消確認」功能；見 A38 討論）。

## 4. 輸入資料 ✅

| 輸入 | 來源 | 狀態 |
|---|---|---|
| `extracted_items`（`status=extracted`／`low_confidence`） | E2-F2 已完成 | ✅ |
| 使用者編輯／新增輸入 | 本輪新增 UI | 待實作 |
| 真實健檢報告樣本（供測試） | KB-023 已記錄極度稀少 | 🔶（本輪改用合成種子資料，見 A39） |

## 5. 輸出結果 ✅

§1 六項交付；完成後使用者能新增、修正、接受或拒絕每一筆辨識候選，並透過確認 transaction 把整份文件的審查結果鎖定為 `confirmed`。確認後的候選仍是 `extracted_items` 表裡的資料，供 E2-F4 後續讀取轉正式紀錄（`observations`）。**不產生** `observations` 表、不做 numeric 轉型、不做單位／別名標準化——這些是 E2-F4 的範圍。

## 6. 驗收條件（Given／When／Then）✅

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | 候選列 `status=low_confidence`，`rawValue` 辨識錯誤 | 使用者 PATCH 修正 `rawValue`，帶正確 `version` | `extracted_item_edits` 新增一筆記錄編輯前的原始值；`extracted_items` 更新為新值、`status=edited`、`version+1` |
| AC-2 | 同上，但帶舊的 `version` | PATCH | 回 `VERSION_CONFLICT`，不覆寫 |
| AC-3 | 候選列辨識正確 | 使用者 PATCH 僅變更 `status=accepted`（不改欄位） | `status=accepted`；`extracted_item_edits` 不新增紀錄 |
| AC-4 | 候選列明顯是雜訊（如頁首誤判殘留） | 使用者 PATCH `status=rejected` | `status=rejected`，列本身保留（不刪除），供日後回查 |
| AC-5（手動新增） | AI 完全漏掉某一列檢驗數據 | 使用者呼叫 `POST .../extractions` 手動輸入 | 新增一筆 `status=accepted` 的候選列，`confidence`／`pageNumber`／`coordinates` 為手動新增情境下的合理預設值（待實作決定，如 `confidence=1.0`、座標為 null 或使用者可另外指定） |
| AC-6（刪除） | 候選列為手動新增後使用者反悔、或明顯雜訊不需保留 | 使用者呼叫 `DELETE .../extractions/{id}` | 該列從 `extracted_items` 移除 |
| AC-7（確認 transaction 完整性） | 文件底下有 3 筆候選，其中 1 筆仍是 `low_confidence`（使用者尚未處理） | 呼叫 confirm | 回錯誤（如 `PENDING_REVIEW_ITEMS`），`documents.status` 不變；直到 3 筆皆已 `edited`／`accepted`／`rejected` 才能成功 |
| AC-8（確認 transaction 成功） | 文件底下所有候選皆已審查完畢 | 呼叫 confirm | `documents.status` 轉 `confirmed` |
| AC-9（憲法 §3／上游 §29 回歸） | 文件尚未執行確認 transaction | （比照上游 §29 原文 BDD：Given 已上傳＋已辨識，But 尚未確認，When 開啟趨勢頁）本輪尚無趨勢頁，僅需確認未確認資料不會被其他既有模組提前引用 | 未確認資料不得被其他模組誤用；本輪僅需確保沒有新增任何會提前洩漏未確認資料的路徑 |
| AC-10（四層鏈重用） | 候選列存在專案 A | 用專案 B 的 id 呼叫任一新端點 | 一律 `PROJECT_ACCESS_DENIED` |
| AC-11（回查原頁，上游 §28.4「每個欄位可回查原始頁面」） | 候選列有 `pageNumber`／`coordinates` | 前端請求對應文件預覽 | 可正確標示出候選列在原始文件中的頁碼與位置區域 |
| AC-12（日誌 P0） | 全程操作（含編輯內容、原始值等） | 掃描日誌 | 不含任何候選列內容，比對 E2-F2 AC-8 標準延續 |
| AC-13（KB-021 決定，記錄非斷言） | 05_BACKLOG §49 footnote 要求 | PO 檢視 | SPRINT_LOG 記錄 PO 對「惡意檔案掃描是否提前」的明確決定 |

## 7. Clarify 釐清 ✅

無新增 Clarify；本輪多處先前因規格缺失而登記的假設，已改為直接引用上游 §17／§18.1／§22.4／§28.4 原文（詳見各節），僅剩資料庫實作層級的技術細節（A36）與測試策略（A39）需要登記假設。

## 8. 可能影響的舊功能 ✅

- **修改 E2-F2 已上線程式碼**：`src/modules/extraction/service.ts` 需新增編輯／新增／刪除／確認 transaction 邏輯；既有 `listExtractedItems`／`reprocessDocument`／`clearExtractedItems` 需重新檢視。
- **UI**：`src/app/projects/[id]/documents/page.tsx` 的 `ExtractionResults` 元件從唯讀改為可互動，改動範圍較大。
- `documents.status` 首次用到 `confirmed`（plain text column，E2-F1 設計時已保留擴充空間，無需 schema migration 即可擴充狀態值本身，但需要 migration 新增 `extracted_item_edits` 表）。

## 9. 一個 Sprint 內可完成 ✅

05_BACKLOG 精估 1 個 Sprint、非 PoC。範圍已收斂為「候選列生命週期管理＋確認 transaction」，且大部分設計決策已有上游原文可直接依循（不需再花時間釐清模糊地帶），預期可在一個 Sprint 內完成。

## 10. 範圍排除 ✅

- **別名對應、單位白名單與換算、numeric 型別轉換、`observations` 表、版本鏈**——E2-F4（SDD §4.6，C15）
- **趨勢頁「未確認資料不顯示」的實際 UI 呈現**——E3 範圍
- **惡意檔案掃描的實際實作**——本輪僅要求 PO 就 KB-021 做出明確決定（AC-13）
- **OCR／拍照掃描上傳**——維持 PO 拍板的排程（E2-F3 之後），本輪不觸碰
- **「取消確認」的獨立 UI 流程**——上游狀態機允許 `confirmed → review_required`，但本輪不特別為此設計新 UI／新端點；若使用者需要重新審查已確認文件，沿用既有 `reprocessDocument`（E2-F2）即可轉回 `processing`，本輪只需確認該既有端點在 `confirmed` 狀態下仍可正常運作，不需額外開發

## 11. 假設登記（待 PO 追認）

- **A36**：編輯異動歷史採**新增 `extracted_item_edits` 表**（append-only）的實作方式，滿足上游 §28.4「確認後有版本紀錄」與憲法 §4「原值永久保留」——上游規格未指定資料庫層級的具體實作機制，此為本輪技術設計決策。
- **A37**：DELETE（徹底移除候選列）與 PATCH status=rejected（標記拒絕但保留列）是兩種不同語意——上游 §28.4／§17 同時列出「刪除／拒絕」，本輪解讀為兩個不同操作而非同義詞，DELETE 用於真正不需要留存的情況（如手動新增後反悔）。
- **A38**：確認 transaction 要求同一文件底下所有候選列都必須先被明確處理（`edited`／`accepted`／`rejected` 三者之一）才能執行——上游規格未明文規定此限制，但符合「未確認資料不進正式分析」的精神，本輪採較嚴格版本，避免使用者漏看某列。
- **A39**：本輪測試不依賴新的真實健檢報告樣本，改用合成種子資料直接寫入 `extracted_items` 測試 CRUD／確認 transaction 邏輯，因 KB-023 已證實真實可用樣本極度稀少。

## 12. 三層結構回溯 ✅

- Feature：**E2-F3**（E2 健檢資料入庫管線，3/4）
- SDD：§4.5（延續 E2-F2）；上游 §17／§18.1／§22.4／§28.4／§29
- 前置依賴：E2-F2 ✅ 已部署驗證通過

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」適用但為重用（AC-10）；「日誌掃描」P0（AC-12）；「LLM Streaming」N/A。**本輪額外要求**：SPRINT_LOG 需記錄 PO 對 KB-021（AC-13）的明確決定；本 DOR 已大幅依上游原文重寫，DOD 需確認 A36–A39（資料庫實作細節與測試策略，非規格本身的模糊地帶）皆已由 PO 追認。
