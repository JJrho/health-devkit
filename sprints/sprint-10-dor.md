# Sprint 10 DOR — E2-F4：標準化與正式紀錄模組

> 狀態：**✅ 通過（PO 2026-07-17：「開啟該 DOR 時即部署」，A40–A44 隨此授權一併追認，本輪一次做到部署為止）**
> 對應：E2-F4（05_BACKLOG E2 表，🟡 風險、非 PoC、精估 1 個 Sprint）；SDD §4.6；上游規格 §17／§22.4／§23／§24／§28.5（archive/upstream_spec/個人健康檢查管理平台_規格_v1_0_0.md）；憲法 §3／§4
> 前置依賴：E2-F3（人工確認與入庫模組）✅ 已 commit＋push＋正式站部署驗證通過

---

## 1. 需求描述 ✅

**範圍定位**：E2-F3 產出「使用者已審查」的 `extracted_items`（`status ∈ {edited, accepted, rejected}`，文件狀態 `confirmed`），但欄位仍是原樣文字，不同院所的同一檢驗項目可能用不同名稱與單位。E2-F4 的職責是把這些候選**標準化**——比對項目別名、驗證單位是否可換算、把可信賴的值轉成 `numeric` 寫入正式紀錄表 `observations`（上游 §17：「正式檢驗紀錄｜由確認建立｜新版本｜軟刪除｜active、superseded、deleted」）。SDD §4.6 設計意圖是本輪的核心紅線：**「不同院所同項目不同名稱與單位——不能合併就寧可不畫線，錯誤連線比沒有連線更危險。原值永遠保留。」**

六項交付：

1. **DB migration**：
   - `test_definitions`（標準化項目定義）：`id`、`canonicalName`（如 "WBC"）、`canonicalUnit`（如 "10^3/uL"）。
   - `test_aliases`（別名對應）：`id`、`testDefinitionId` FK、`aliasText`（如 "WBC"、"白血球"、"白血球計數"，皆對應同一 definition）。比對時對 `rawTestName` 做**精確字串比對**（去除前後空白），非模糊比對——模糊比對誤連風險過高，違反上述設計意圖（A40）。
   - `test_definition_units`（單位換算白名單）：`id`、`testDefinitionId` FK、`unitText`（如 "10^3/uL"、"K/uL"）、`factorToCanonical`（`numeric`，乘法換算係數；MVP 只支援線性換算，不支援需要偏移量的單位如溫度 °F↔°C——本輪檢驗項目皆無此需求）。
   - `observations`（正式紀錄）：`id`、`projectId` FK、`documentId` FK、`extractedItemId` FK（可追溯來源）、`testDefinitionId` FK、`numericValue`（`numeric`，已換算為 canonical 單位；憲法 §4「健康數值須用 numeric」本輪首次真正落地）、`unit`（text，記錄 canonical 單位本身，方便查詢不用每次 join）、`rawValue`／`rawUnit`（text，原樣保留，憲法 §4「原值永遠保留」）、`pageNumber`／`coordinates`（jsonb，沿用回查原頁設計）、`status`（`active`／`superseded`／`deleted`）、`version`、時間戳、`deletedAt`（軟刪除）。
   - Seed：僅涵蓋上游 §34「最終 MVP 凍結範圍」明列的「常見血液、尿液、血糖、血脂、肝功能、腎功能與尿酸項目」中，此前測試／文件裡已出現過的少量項目（WBC、Glucose、Cholesterol、Vitamin D 等，具體清單見實作），**不追求完整醫學術語庫覆蓋**（A41——完整術語庫是後續迭代的事，本輪只求管線走得通、原則正確）。
2. **標準化 job（Worker）**：`confirmDocument`（E2-F3）成功時，額外 enqueue 一個 `standardize-document` 工作（沿用 PG queue，比照 `parse-document` 模式，同樣包 KB-022 逾時防線）。Worker 讀取該文件所有 `status ∈ {edited, accepted}` 的候選列（**`rejected` 不參與標準化**，符合語意）：
   - 若 `rawTestName` 精確比對得到 `test_alias` → 找到 `test_definition`；否則該列**不建立 observation**，視為「無法標準化」，不算失敗，只是還沒有別名資料庫涵蓋（A41 的直接後果，記錄計數但不阻塞其他列）。
   - 若找到 definition，檢查 `rawUnit` 是否在該 definition 的 `test_definition_units` 白名單內：
     - 在白名單內 → 用 `factorToCanonical` 換算出 `numericValue`，寫入 `observations`（`status=active`）。
     - `rawUnit` 為 `null`（E2-F2/F3 的「無法辨識」情境）或不在白名單內 → **不建立 observation**（上游 §28.5／SDD §4.6：「不可換算不得錯誤連線」），比照 Sprint 8 的原則——寧可不畫線，不猜測換算。
3. **API 路由**（依上游 §22.4 路徑慣例）：
   - `GET /api/projects/{id}/observations`：列出專案下所有 `active` 正式紀錄（四層鏈：`findOwnedProject`，沿用既有模式）。
   - `DELETE /api/projects/{id}/observations/{observationId}`：軟刪除（`status=deleted`）。
   - `PATCH /api/projects/{id}/observations/{observationId}`：修正數值/單位——**建立新版本列**（新 `id`、`version+1`、`extractedItemId` 沿用同一來源），**舊列標記 `status=superseded`**，不原地覆寫（憲法 §4「Original values … MUST be preserved forever; edits create new versions」比照 A36 的精神，但 observations 是正式紀錄，用「整列新增＋前版 superseded」而非 E2-F3 的「異動歷史子表」，因為 observations 本身就需要完整版本鏈供日後查閱，不只是稽核用途，A42）。
4. **四層鏈重用**：新端點沿用 `findOwnedProject`（`observations` 直接掛在 project 下，不像 `extracted_items` 掛在 document 下——比照上游 §22.4 路徑設計 `/projects/{id}/observations`，非 `/projects/{id}/documents/{documentId}/observations`，因為同一檢驗項目的版本鏈會跨越不同文件／不同次健檢，屬於專案層級的資源，A43）。
5. **UI**：文件列表頁新增顯示「已入庫項目」摘要（僅唯讀列表，不含完整戰情頁——戰情/趨勢視覺化是 E3 範圍）；不需要新頁面，比照 E2-F3 唯讀延伸即可。
6. **測試**：四類齊備＋四層鏈重用測試＋標準化邏輯測試（別名比對成功／失敗、單位換算成功／失敗、rejected 列不參與）。比照 Sprint 8／9，測試策略用合成種子資料直接寫入 DB，不依賴新的真實樣本（A44，延續 KB-023 的既有理由）。

## 2. 使用者角色 ✅

同 E2-F1～F3：**終端使用者（本人）**，已驗證（延續 C6）。

## 3. 操作流程 ✅

使用者在 E2-F3 完成確認 → 系統自動觸發標準化（使用者無感，背景 Worker 工作）→ 能標準化的候選列轉為正式 `observations`（供未來 E3 戰情頁使用）；不能標準化的候選列（別名未涵蓋、單位不可換算）維持在 `extracted_items` 裡，不會消失也不會被錯誤合併，日後別名庫擴充後可重新標準化（本輪不含「重新標準化」觸發機制，見範圍排除）。

## 4. 輸入資料 ✅

| 輸入 | 來源 | 狀態 |
|---|---|---|
| `extracted_items`（`status ∈ {edited, accepted}`，文件 `confirmed`） | E2-F3 已完成並部署 | ✅ |
| `test_definitions`／`test_aliases`／`test_definition_units` seed 資料 | 本輪新增（小範圍，見 A41） | 待實作 |

## 5. 輸出結果 ✅

§1 六項交付；完成後可標準化的候選列有對應的正式 `numeric` 紀錄，供未來 E3 戰情／趨勢頁讀取；不可標準化的候選列誠實地維持未入庫狀態，不產生錯誤連線。

## 6. 驗收條件（Given／When／Then）✅

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | 候選列 `rawTestName="WBC"`、`status=accepted`、`rawUnit="10^3/uL"`（在白名單內） | 文件確認觸發標準化 | 建立 `observations` 一筆，`numericValue` 正確換算、`status=active`、可追溯 `extractedItemId` |
| AC-2 | 候選列 `rawTestName` 不在任何別名庫（如拼寫特殊或罕見項目） | 標準化執行 | 不建立 observation，`extracted_items` 原列不受影響，不報錯中斷其他列 |
| AC-3 | 候選列別名比對成功，但 `rawUnit` 不在該項目白名單內（或為 `null`） | 標準化執行 | 不建立 observation（上游「不可換算不得錯誤連線」） |
| AC-4 | 候選列 `status=rejected` | 標準化執行 | 不參與標準化，不建立 observation |
| AC-5（版本鏈） | 已有一筆 `active` observation | 呼叫 PATCH 修正數值 | 新增一筆新 `version` 的 observation（`active`），舊列轉 `superseded`，舊列原值仍可查詢 |
| AC-6 | observation 存在專案 A | 用專案 B 的 id 查／刪／改 | 一律 `PROJECT_ACCESS_DENIED` |
| AC-7（憲法 §4 numeric 落地） | 標準化成功寫入的 observation | 檢查資料庫欄位型別 | `numericValue` 為 `numeric` 型別，非文字或浮點誤差風險型別 |
| AC-8（日誌 P0） | 全程標準化操作（含比對結果、數值） | 掃描日誌 | 不含候選列或正式紀錄內容 |
| AC-9（KB-022 沿用） | `standardize-document` 工作 | 執行超過逾時上限 | 視同失敗，Worker 不被卡死，延續既有逾時防線設計 |

## 7. Clarify 釐清 ✅

無新增 Clarify；C15（同日同項多筆全數保留、不自動平均）在本輪需注意：同一文件若有多筆同項目候選列（如同一報告誤植兩次），標準化時**逐筆各自建立 observation**，不去重合併——去重合併不是本輪職責，且違反 C15。

## 8. 可能影響的舊功能 ✅

- `src/modules/extraction/service.ts` 的 `confirmDocument`：需在確認成功後額外 enqueue `standardize-document` 工作。
- `src/worker/job-handlers.ts`：新增 `standardize-document` handler。
- 不修改 `extracted_items` 既有欄位或 API 行為，E2-F4 只新增讀取，不寫回。

## 9. 一個 Sprint 內可完成 ✅

05_BACKLOG 精估 1 個 Sprint、非 PoC。範圍已收斂為「小範圍 seed＋標準化 job＋唯讀＋PATCH 版本鏈」，不含完整醫學術語庫、不含戰情頁視覺化。

## 10. 範圍排除 ✅

- **完整醫學檢驗項目術語庫／別名庫**——本輪僅 seed 少量已知項目（A41），持續擴充留待未來迭代或管理者維護介面（MVP 無管理 UI，比照 C3 既有決策）
- **健康戰情 Dashboard／趨勢圖視覺化**——E3 範圍
- **「重新標準化」觸發機制**（別名庫擴充後回頭處理之前未標準化的候選列）——本輪不做，未標準化的候選列目前僅能停留在 `extracted_items`，不影響資料安全（未被錯誤合併），但使用者暫時看不到正式紀錄；此為已知限制，非阻塞
- **模糊比對／AI 輔助別名建議**——本輪只做精確字串比對（A40），避免誤連風險
- **溫度等非線性單位換算**——本輪只支援乘法係數換算，MVP 範圍內的檢驗項目皆無此需求

## 11. 假設登記（待 PO 追認）

- **A40**：別名比對採**精確字串比對**（去除前後空白），非模糊比對——寧可漏掉沒建別名的項目（維持在候選列不消失），也不要因模糊比對誤連不同項目，對應 SDD §4.6「錯誤連線比沒有連線更危險」。
- **A41**：`test_definitions`／`test_aliases`／`test_definition_units` 本輪僅 seed 小範圍已知項目（涵蓋 Sprint 7-9 測試中出現過的項目，如 WBC、Glucose、Cholesterol、Vitamin D），不追求完整醫學術語庫覆蓋；MVP 精神是「管線走得通、原則正確」優先於「覆蓋率」，與 KB-023 的 OCR 優先順序邏輯一致（先把管線做對，覆蓋率是後續迭代的事）。
- **A42**：`observations` 的編輯採「整列新增＋前版 superseded」的完整版本鏈，而非 E2-F3 `extracted_item_edits` 的「異動歷史子表」——因為 observations 是正式紀錄，版本鏈本身就是使用者查閱歷史的一部分（不只是稽核用途），上游 §17 也明確把「新版本」列為 observations 的修改方式。
- **A43**：`observations` API 掛在 `/api/projects/{id}/observations`（專案層級），不掛在特定 document 底下——因為同一檢驗項目的版本鏈可能橫跨不同文件／不同次健檢，屬於專案層級資源，比照上游 §22.4 的路徑設計。
- **A44**：本輪測試不依賴新的真實健檢報告樣本，改用合成種子資料直接寫入 DB 測試標準化邏輯，延續 KB-023／A34／A39 已建立的測試策略。

## 12. 三層結構回溯 ✅

- Feature：**E2-F4**（E2 健檢資料入庫管線，4/4，E2 全數結案）
- SDD：§4.6；上游 §17／§22.4／§23／§28.5
- 前置依賴：E2-F3 ✅ 已部署驗證通過

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」適用（AC-6，`findOwnedProject` 重用）；「日誌掃描」P0（AC-8）；「LLM Streaming」N/A。**本輪額外要求**：SPRINT_LOG 需誠實記錄 seed 資料範圍侷限（A41），不誇大宣稱「完成檢驗項目標準化」——本輪只是把管線與原則做對，覆蓋率仍待擴充。
