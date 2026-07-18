# Sprint 11 DOR — E3-F2：趨勢圖與等價資料表

> 狀態：**✅ 通過（PO 2026-07-18：確認 A45–A49 並通過 DOR，開工實作）**
> 對應：E3-F2（05_BACKLOG E3 表，🟡 風險、非 PoC、精估 1 個 Sprint）；SDD §4.7；上游規格 §6.2／§17／§22.4／§24／§25／§27.1／§27.4／§28.5／§29／§30／Stage 6（archive/upstream_spec/個人健康檢查管理平台_規格_v1_0_0.md）；技術選型 §5.4／04_TECHNICAL_SPEC.md（ECharts）；憲法 §3／§4
> 前置依賴：E2-F4（標準化與正式紀錄模組）✅ 已 commit＋push＋正式站部署驗證通過
> 建議 Sprint 順序（05_BACKLOG）：E2-F4 → **E3-F2** → E3-F1 → E4-F1……——E3-F1（健康戰情 Dashboard）之六區塊高度依賴 E5（行動計畫，尚未實作），故依既定順序本輪先做 E3-F2

---

## 0. 開工前規格核對發現（新發現，非本輪修 bug，屬「補齊先前輪次遺漏欄位」）

撰寫本 DOR 時逐條核對上游 §17／§28.5，發現兩個先前輪次遺漏、會直接擋住本輪功能的資料缺口：

1. **`documents` 無日期欄位**：上游 §17 物件表明列健檔文件可修改欄位為「檔名、日期、類型」，但 Sprint 6（E2-F1）當時的程式註解已明說「本輪範圍止於 uploaded」，未實作 PATCH 與日期欄位（合理的範圍收斂，非疏漏）。但 E3-F2 的趨勢圖 x 軸本質上需要「檢驗日期」而非「上傳日期」——兩者可能差異數週（上游 §30 Edge Case 也列「報告沒有日期」，隱含日期本是預期欄位）。**本輪需補上** `documents.reportDate`（見 A45）。
2. **`observations` 未攜帶參考區間**：`extracted_items.rawReferenceRange` 在 E2-F3 已存在，但 Sprint 10 的 `standardizeDocument` 寫入 `observations` 時未把它一併帶過去。上游 §28.5 明列「參考區間依日期呈現」為戰情／趨勢驗收條件之一，目前資料模型缺這個欄位就無法做到。**本輪需補上** `observations.rawReferenceRange`（見 A46）。

兩者皆為「先前輪次因範圍收斂而合理省略、現在下游功能需要才補上」的欄位補齊，不是修正錯誤程式碼，依 11_AI_AGENT_INSTRUCTIONS §3「發現程式錯誤：先提規格修改建議」精神一併寫入本 DOR，非事後補丁。

---

## 1. 需求描述

**範圍定位**：E2-F4 已把確認過的候選列轉成正式 `observations`（`numeric`、已換算 canonical 單位、可回查來源）。E3-F2 的職責是把這些正式紀錄依「檢驗項目」分組，畫成**時間序列趨勢圖**＋**等價可存取資料表**，讓使用者一眼看到「哪個數值正在改變」（上游 §32 非技術版說明）。SDD §4.7 設計意圖：「只用已確認資料、每點可回查——『可追溯』是使用者敢給醫師看的前提。」

七項交付：

1. **DB migration（欄位補齊，見 §0）**：
   - `documents.reportDate`（`date`，nullable）：檢驗／報告日期，與 `createdAt`（上傳時間）語意分離。
   - `observations.rawReferenceRange`（`text`，nullable）：標準化時從 `extracted_items.rawReferenceRange` 原樣複製（憲法 §4「原值永遠保留」的延伸——參考區間也是原始報告內容，不重新計算）。
2. **`documents` PATCH 端點（新增，範圍收斂版）**：`PATCH /api/projects/{id}/documents/{documentId}`，本輪僅支援編輯 `reportDate`（上游列出的「檔名、日期、類型」中，僅日期是本輪真正需要的；檔名/類型編輯非本輪職責，範圍排除，見 A47）。純描述性中繼資料，**不比照 E2-F3 的 confirmed 鎖定規則**——與辨識候選列的審查語意無關，任何文件狀態下皆可編輯（見 §7 Clarify）。
3. **`standardizeDocument` 小改**：`observations` 新增列時一併複製 `item.rawReferenceRange`（不影響既有欄位與換算邏輯）。
4. **`GET /api/projects/{id}/trends`**（依上游 §22.4 路徑）：
   - 讀取專案下所有 `status=active` 的 `observations`，依 `testDefinitionId` 分組成多筆序列（`canonicalName`、`canonicalUnit`、`points[]`）。
   - 每個 `point`：`value`（`numericValue`）、`date`（`document.reportDate` 有值則用，否則 fallback `document.createdAt` 並標記 `dateEstimated: true`，對應上游 Edge Case「報告沒有日期」）、`referenceRange`（`rawReferenceRange`，可能為 `null`）、`documentId`＋`pageNumber`（供 drill-down 回查原頁，沿用 E2-F3 的 `#page=N` signed URL 機制）。
   - **防護性檢查（A48）**：雖然 E2-F4 的資料模型已在寫入時就保證同一 `testDefinitionId` 的所有 `observations` 都是同一 canonical 單位換算後的結果（結構上不可能出現不可換算的混線），本端點仍以 `unit` 欄位再次分組——若同一 `testDefinitionId` 下出現超過一種 `unit`（理論上不該發生，除非資料完整性被破壞），**拆成獨立子序列，絕不靜默合併**，落實上游 §28.5「不可換算不得錯誤連線」的縱深防禦，而非只信任寫入時的保證。
   - 點依日期排序；同一天多筆保持各自獨立點（C15：同日多次檢驗不去重合併，沿用既有原則）。
5. **四層鏈重用**：`GET /trends` 與 `PATCH /documents/{id}` 皆沿用 `findOwnedProject`／既有文件四層鏈模式。
6. **UI（新頁面 `/projects/[id]/trends`，上游 §6.2「趨勢分析」為十個工作區頁面之一，非附屬於文件頁）**：
   - 每個檢驗項目一張 ECharts 折線圖（`echarts` 套件，技術選型 §5.4／04_TECHNICAL_SPEC.md 已定案，非新假設；client component 動態載入，避免 SSR 問題）。
   - 圖表旁附**等價可存取資料表**（純 HTML `<table>`，同樣資料，滿足上游 §27.4 WCAG 2.2 AA／Stage 6「提供可存取資料表」）。
   - 每個資料點／表格列可點擊 → 開啟來源文件 signed URL＋`#page=N`（沿用 E2-F3 的回查原頁模式）。
   - 參考區間依日期於資料表顯示（圖表本身不疊參考區間帶，避免本輪視覺複雜度超出範圍——純折線＋資料表已滿足上游驗收條件字面要求）。
   - 若某測項尚無任何 `observations`（如剛上傳但未確認），不顯示該測項卡片；若專案完全沒有任何正式紀錄，顯示引導文字（「尚無已確認資料」），不顯示空圖表。
   - `reportDate` 編輯：文件列表頁（`/projects/[id]/documents`）每份文件旁新增一個簡單日期輸入框（非新頁面，比照既有唯讀延伸模式）。
   - 專案列表頁（`/projects`）每個專案列新增「趨勢分析」連結（與既有「個人背景」「健檔文件」並列）。
7. **測試**：四類齊備＋四層鏈重用＋分組換算正確性＋防護性拆分＋日期 fallback＋參考區間攜帶。比照 Sprint 8～10，測試策略用合成種子資料直接寫入 DB（A49，延續 KB-023 的既有理由）。

## 2. 使用者角色

同 E1～E2 各輪：**終端使用者（本人）**，已驗證（延續 C6）。

## 3. 操作流程

使用者於文件列表頁為已上傳文件補上檢驗日期（選填）→ 進入「趨勢分析」頁 → 依測項瀏覽時間序列圖與對應資料表 → 點擊任一資料點或表格列 → 開啟原始報告該頁確認來源。全程唯讀查詢，不涉及資料寫入（除 `reportDate` 編輯本身）。

## 4. 輸入資料

| 輸入 | 來源 | 狀態 |
|---|---|---|
| `observations`（`status=active`） | E2-F4 已完成並部署 | ✅ |
| `documents.reportDate` | 本輪新增欄位，使用者選填 | 待實作 |
| `observations.rawReferenceRange` | 本輪新增欄位，標準化時自動複製 | 待實作 |

## 5. 輸出結果

§1 七項交付；完成後使用者可在「趨勢分析」頁看到每個已標準化測項的時間序列與等價資料表，每點可回查來源，不可換算的資料不會被錯誤連線。

## 6. 驗收條件（Given／When／Then）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（核心趨勢） | 同一測項有 2 筆以上 `active` observations，日期不同 | 呼叫 `GET /trends` | 回傳依日期排序的單一序列，每點含 value／date／referenceRange／documentId／pageNumber |
| AC-2（未確認資料不進趨勢，上游 §29 BDD） | 某文件已辨識但尚未確認（`extracted_items` 存在，無對應 `observations`） | 呼叫 `GET /trends` | 該文件資料不出現在任何序列（結構性保證：trends 只讀 `observations`），寫回歸測試鎖定此不變量 |
| AC-3（日期 fallback） | 文件 `reportDate` 為 `null` | 該文件的 observation 出現在趨勢 | `point.date` fallback 為 `document.createdAt`，`dateEstimated=true` |
| AC-4（參考區間攜帶） | 候選列 `rawReferenceRange="4.0-10.0"` 確認並標準化 | 查詢對應 observation | `rawReferenceRange` 正確攜帶，趨勢回應與資料表皆可顯示 |
| AC-5（四層鏈重用） | trends／文件 PATCH 皆存在專案 A | 用專案 B 的 id 查／改 | 一律 `PROJECT_ACCESS_DENIED` |
| AC-6（分組不誤連） | 兩個不同 `testDefinitionId` 各有 observations | 呼叫 `GET /trends` | 回傳兩筆獨立序列，絕不合併為一 |
| AC-7（防護性拆分，A48） | 直接於測試 DB 建構「同一 `testDefinitionId` 但 `unit` 不同」的異常資料（模擬資料完整性被破壞） | 呼叫 `GET /trends` | 拆成兩筆獨立子序列，不靜默合併（縱深防禦，非預期正常路徑） |
| AC-8（`reportDate` 編輯） | 文件存在（任一狀態） | PATCH 設定 `reportDate` | 成功更新，任何文件狀態皆可編輯（不比照 E2-F3 鎖定規則，見 §7） |
| AC-9（日誌 P0） | 全程趨勢查詢與日期編輯操作 | 掃描日誌 | 不含檢驗數值、項目名稱、日期等健康內容 |
| AC-10（等價資料表，上游 §27.4） | 趨勢頁已載入圖表 | 瀏覽器檢視 DOM | 每張圖表旁存在對應 `<table>`，資料筆數與圖表點數一致 |

## 7. Clarify 釐清

**`reportDate` 是否需要比照 E2-F3 的 confirmed 鎖定規則？** 不需要（新 Clarify，本輪回答並寫入 SDD）——E2-F3 鎖定的是「辨識候選列的審查內容」，防止確認後被靜默竄改而失去可信度；`reportDate` 是使用者自行補充的描述性中繼資料（報告日期），不屬於辨識/確認鏈的一部分，且使用者事後想到正確日期時應能隨時補正，鎖定反而造成不便且無安全效益。此區分本身即為本輪一項需登記的假設（A47 的一部分）。

## 8. 可能影響的舊功能

- `src/db/schema/documents.ts`：新增 `reportDate` 欄位（nullable，不影響既有查詢）。
- `src/db/schema/observations.ts`：新增 `rawReferenceRange` 欄位（nullable，不影響既有查詢與換算邏輯）。
- `src/modules/observations/service.ts` 的 `standardizeDocument`：`insert` 時多帶一個欄位，其餘邏輯不變。
- `src/app/projects/[id]/documents/page.tsx`：新增日期輸入框與趨勢分析連結，不影響既有解析結果／確認/入庫顯示邏輯。
- `src/app/projects/page.tsx`：新增一個連結，不影響既有 CRUD。
- 不修改 `extracted_items`／`extraction` 模組既有欄位或 API 行為。

## 9. 一個 Sprint 內可完成

05_BACKLOG 精估 1 個 Sprint、非 PoC。範圍已收斂為「兩個欄位補齊＋唯讀趨勢端點＋單頁 UI（折線圖＋資料表）＋日期編輯」，不含：戰情 Dashboard（E3-F1，依賴未實作的 E5 行動計畫）、圖表疊參考區間帶、篩選/區間縮放等進階互動。

## 10. 範圍排除

- **健康戰情 Dashboard 六區塊**（E3-F1）——依賴「目前行動計畫」「早期變化」「專業協助」等資料，來自尚未實作的 E4／E5，依既定 Sprint 順序（05_BACKLOG）排在 E3-F2 之後
- **圖表疊加參考區間視覺帶／進階縮放互動**——本輪僅資料表列出參考區間，滿足上游字面驗收條件（「參考區間依日期呈現」不等於必須疊圖），進階視覺化留待使用者回饋後再迭代
- **`documents` 檔名／類型 PATCH**——本輪僅開放日期欄位編輯（A47），其餘上游列出的可編輯欄位非趨勢功能所需，不擴大範圍
- **「重新標準化」觸發機制**——沿用 E2-F4 DOR 既有排除理由，不因本輪新增欄位而重新討論
- **跨專案／跨帳號趨勢比較、匯出**——非本輪範圍（E5-F4 看診摘要與匯出模組職責）

## 11. 假設登記（待 PO 追認）

- **A45**：新增 `documents.reportDate`（nullable date）以支援趨勢圖的時間軸；未設定時 fallback 為上傳時間並於回應標記 `dateEstimated`，對應上游 §30 Edge Case「報告沒有日期」。
- **A46**：`observations` 新增 `rawReferenceRange`（nullable text），標準化時原樣從 `extracted_items` 複製，落實憲法 §4「原值永遠保留」延伸至參考區間；不重新計算或正規化參考區間格式。
- **A47**：`documents` PATCH 本輪僅開放編輯 `reportDate`，且不比照 E2-F3 confirmed 鎖定規則（任何文件狀態皆可編輯）——理由見 §7 Clarify，日期是描述性中繼資料非審查內容。
- **A48**：`GET /trends` 在結構上已知同一 `testDefinitionId` 必為同一 canonical 單位（E2-F4 寫入時保證），但仍加一層「依 `unit` 再分組、若出現異常混線就拆序列」的防護性檢查，作為縱深防禦而非重複驗證——不視為對 E2-F4 設計的不信任，而是「正式紀錄呈現層本身也不該假設上游資料永遠正確」的一致性原則。
- **A49**：本輪測試不依賴新的真實健檢報告樣本，改用合成種子資料直接寫入 DB 測試趨勢分組與日期 fallback 邏輯，延續 KB-023／A34／A39／A44 已建立的測試策略。

## 12. 三層結構回溯

- Feature：**E3-F2**（E3 健康洞察呈現層，1/2）
- SDD：§4.7；上游 §6.2／§17／§22.4／§24／§25／§27.1／§27.4／§28.5／§29／§30／Stage 6
- 前置依賴：E2-F4 ✅ 已部署驗證通過

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」適用（AC-5，`findOwnedProject`／文件四層鏈重用）；「日誌掃描」P0（AC-9）；「LLM Streaming」N/A。**本輪額外要求**：SPRINT_LOG 需誠實記錄「參考區間本輪僅資料表呈現、圖表未疊視覺帶」與「Dashboard 六區塊尚未開始（依賴 E4/E5）」，避免誇大宣稱「E3 全數完成」。
