# Sprint 20 DOR — E5-F3：定期檢討與無改善分類模組（十分類＋轉介摘要）

> 狀態：**草案，待 PO 確認 A111–A120 並通過 DOR**
> 對應：E5-F3（05_BACKLOG E5 表，🟡 風險，精估 1 個 Sprint）；SDD §4.11；上游規格 §9／§17／§18.3／§22.6／§23／§28.7／Stage 9（後半）；憲法 §3（無改善不得自動增強度／不得責怪使用者）
> 前置依賴：E5-F2（日常回報與症狀事件模組）✅ 已完成（已 commit／push／正式站部署驗證通過）
> 建議 Sprint 順序（05_BACKLOG）：……E5-F2（已完成）→ **E5-F3（本輪）** → E1-F3 → E1-F5＊ → E5-F4……

---

## 1. 需求描述

**範圍定位**：E5-F1／E5-F2 讓使用者建立可停止的行動計畫並在執行期間記錄日常回報與症狀事件。E5-F3 補上「計畫到了該檢討的時候」的處理——上游規格 §9 明訂一套「無改善處理規則」：沒有改善時系統不得責怪使用者、不得自動增加強度／限制／保健品，必須把結果分類（十分類，§9.3）與下一步決定都交回使用者，系統只負責結構化呈現與記錄。本輪同時交付「專業轉介摘要」（`escalation_summaries`）——當檢討結果判定需要專業評估時，產生一份結構化摘要供使用者攜帶就診使用。

三項交付：

1. **DB migration**：兩張新表（上游 §23）——
   - `plan_reviews`：`id`、`planId`（FK）、`status`（上游 §17 逐字：`pending`／`in_review`／`completed`）、`classification`（十分類，見 A114，`completed` 前為 null）、`notes`（text, nullable，使用者可附加檢討脈絡）、`reviewedAt`（nullable，`completed` 時寫入）、`createdAt`／`updatedAt`
   - `escalation_summaries`：`id`、`planId`（FK）、`status`（上游 §17 逐字：`draft`／`ready`／`exported`／`deleted`）、`content`（text，結構化摘要內容，見 A118）、`createdAt`／`updatedAt`
2. **服務層**（`src/modules/plans/` 擴充）：
   - `createReview()`（僅計畫達檢討日或使用者主動發起時可建立，見 A113）／`completeReview()`（寫入十分類判斷＋選填備註，依分類結果決定計畫狀態轉換，見 A115）
   - `createEscalationSummary()`／`updateEscalationSummary()`（更新涵蓋範圍）／`markEscalationSummaryExported()`／`deleteEscalationSummary()`
3. **API 路由**（四層權限鏈延伸既有 `findOwnedPlan` 模式，逐字比照上游 §22.6）：
   ```
   POST   /api/projects/{id}/plans/{planId}/reviews
   PATCH  /api/projects/{id}/plans/{planId}/reviews/{reviewId}
   POST   /api/projects/{id}/plans/{planId}/escalation-summary
   PATCH  /api/projects/{id}/plans/{planId}/escalation-summary/{summaryId}
   DELETE /api/projects/{id}/plans/{planId}/escalation-summary/{summaryId}
   ```
   `getPlan()` 擴充回傳 `reviews`／`escalationSummaries`，延續 Sprint 18/19 內嵌既有模式。
4. **UI**：併入既有 `/projects/[id]/plans` 頁面的計畫詳情面板，新增「定期檢討」「專業轉介摘要」兩區塊；計畫達檢討日時顯示提示與十分類選單（非文字輸入，避免自由文字繞過結構化分類）。

## 2. 使用者角色

專案擁有者（一般使用者）：計畫到達檢討日時，依系統引導完成一次結構化檢討（十分類），視結果決定維持／簡化／替代／停止／專業評估；若判定需要專業評估，可產生轉介摘要供就診攜帶。

## 3. 操作流程

計畫詳情面板顯示「檢討」區塊 → 若已達 `reviewDate` 且尚無進行中的檢討，顯示「開始檢討」按鈕 → 建立 `plan_reviews`（`status=in_review`）→ 使用者從十分類下拉選單選擇分類結果＋選填備註 → 送出後 `status=completed`，`reviewedAt` 寫入，依分類結果可能連動計畫狀態（見 A115）→ 若分類為「需要專業評估」，面板顯示「產生轉介摘要」按鈕 → 產生後可檢視、更新涵蓋範圍、標記已匯出或刪除。

## 4. 輸入資料

| 輸入 | 來源 | 狀態 |
|---|---|---|
| 計畫 `reviewDate`／既有狀態 | E5-F1 已完成 | ✅ 已完成，本輪查詢使用 |
| 日常回報／症狀事件歷史 | E5-F2 已完成 | ✅ 已完成，本輪供使用者檢討時參考（非自動判讀） |
| 使用者選擇的十分類結果與備註 | 使用者輸入（下拉選單，非自由文字分類） | 待驗證輸入不可信，比照既有模式 |

## 5. 輸出結果

§1 三項交付；完成後使用者可在計畫達檢討日時完成一次結構化檢討並記錄十分類判斷，系統依判斷結果呈現維持／簡化／替代／停止／專業評估選項但不自動執行任何一項；判定需要專業評估時可產生結構化轉介摘要。

## 6. 驗收條件（Given／When／Then，草案，待 PO 確認）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（檢討建立） | 計畫 `active`，已達 `reviewDate` | 建立 review | 成功，`status=in_review` |
| AC-2（檢討建立拒絕情境） | 計畫未達 `reviewDate`，或計畫非 `active`／`paused` | 建立 review | 一律拒絕（`INVALID_REQUEST`） |
| AC-3（檢討完成，十分類） | review `in_review` | 送出十分類判斷之一 | 成功，`status=completed`，`reviewedAt` 寫入，`classification` 正確記錄 |
| AC-4（十分類為非法值） | review `in_review` | 送出不在十分類清單內的字串 | 拒絕（`INVALID_REQUEST`），確認為白名單驗證非自由文字 |
| AC-5（無改善不自動增強度，核心） | review 判斷為「計畫可能無效」 | 檢討完成 | 計畫狀態轉為 `ineffective`；**系統不自動修改任何行動／指標／強度**；UI 顯示維持／簡化／替代／停止／專業評估五個選項供使用者手動決定 |
| AC-6（需要專業評估） | review 判斷為「需要專業評估」 | 檢討完成 | 計畫狀態轉為 `escalated`；面板顯示可產生轉介摘要 |
| AC-7（有改善／部分改善／暫時穩定等） | review 判斷為其餘七類之一 | 檢討完成 | 計畫狀態不變（維持 `active`／`paused`），僅記錄檢討歷史 |
| AC-8（已完成的檢討不可覆寫） | review `completed` | 嘗試再次 `PATCH` | 拒絕（`INVALID_REQUEST`，比照上游 §17「不覆寫」） |
| AC-9（轉介摘要 CRUD） | 計畫已產生轉介摘要 | 更新涵蓋範圍／標記已匯出／刪除 | 皆正確轉換 `draft`→`ready`→`exported`；刪除後 `status=deleted` |
| AC-10（四層權限鏈） | review／轉介摘要存在專案 A | 其他帳號存取 | 一律 `PROJECT_ACCESS_DENIED` |
| AC-11（UI） | 計畫詳情面板 | 達檢討日／完成檢討／產生轉介摘要 | 畫面即時反映，十分類為下拉選單非自由文字輸入 |
| AC-12（日誌 P0） | 建立／完成檢討與轉介摘要全流程 | 掃描日誌 | 不含 `notes`／`content` 等健康敘述內容 |

## 7. Clarify 釐清

無新增 Clarify；本輪高不確定性項目以假設方式登記（A111–A120），待 PO 於通過 DOR 時一併追認。**其中 A113／A115／A116／A118 為架構性判斷，影響範圍較大，特別提請 PO 留意**。

## 8. 可能影響的舊功能

- `getPlan()` 回傳型別再次擴充（新增 `reviews`／`escalationSummaries` 欄位），既有呼叫端（Sprint 17–19 測試、UI）僅新增欄位，非破壞性變更
- 計畫狀態集合新增 `ineffective`／`escalated`（皆為 `text` 欄位，非 DB enum，無需修改既有欄位定義），既有的 `TERMINAL_STATUSES`／`ADJUSTABLE_STATUSES` 判斷需重新檢視是否納入這兩個新狀態（見 A116）
- 若採 A113 的「不落地 `review_due` 狀態、僅計算式判斷是否達檢討日」方案，則上游 §18.3 狀態圖中的 `active→review_due` 轉換不會在 `status` 欄位實際發生，僅影響 UI 呈現與是否允許建立 review 的判斷邏輯

## 9. 一個 Sprint 內可完成

05_BACKLOG 精估 1 個 Sprint、風險 🟡（非 PoC）。範圍為兩張新表＋檢討流程＋轉介摘要 CRUD＋UI 併入既有頁面，複雜度與 E5-F2 相近但多一組狀態轉換判斷與白名單分類邏輯。**若實作中發現規模超出預期**，比照 E5-F1／E5-F2 先例——backend＋API＋測試優先出貨，UI 或轉介摘要 CRUD 可延後至下一輪（Part 2/2），並在 SPRINT_LOG 誠實記錄（A111）。

## 10. 範圍排除

- **看診摘要與資料匯出（PDF／檔案下載等具體匯出格式）**——屬 E5-F4「看診摘要與資料匯出模組（C19/C20）」範圍，本輪 `escalation_summaries` 僅產生結構化內容與狀態機，不含匯出檔案格式或下載端點
- **LLM 生成轉介摘要內容**——本輪轉介摘要為結構化聚合既有資料（計畫基準／檢討歷史／症狀事件），非 LLM 生成，延續「安全判斷不自動化」一貫原則，見 A118
- **背景排程自動建立檢討（cron／worker 觸發）**——本專案尚無日期觸發的排程子系統（現有 worker 僅處理文件解析／標準化等 job queue 任務），本輪檢討建立為使用者主動觸發，見 A113
- **無改善分類後的自動執行**（自動簡化行動、自動調整指標等）——十分類結果僅呈現選項，所有後續動作（調整／暫停／停止）仍需使用者透過既有端點手動執行，這是本輪最核心的安全邊界（憲法 §3）

## 11. 假設登記（待 PO 追認）

- **A111（新增）**：Sprint 20 目標涵蓋 `plan_reviews`／`escalation_summaries` 兩張新表＋服務層＋API＋UI，先嘗試在單一 Sprint 內完成（比照 05_BACKLOG 1 個 Sprint 預算）；若規模超出預期，backend 優先出貨、轉介摘要 CRUD 或 UI 延後，比照 E5-F1／E5-F2 拆分先例處理，誠實記錄於 SPRINT_LOG。
- **A112（新增）**：`plan_reviews` 狀態機依上游 §17 逐字落地（`pending`／`in_review`／`completed`）；`escalation_summaries` 依上游 §17 逐字（`draft`／`ready`／`exported`／`deleted`）。`completed` 的 review 不可再 `PATCH`（上游 §17「不覆寫」），比照 `observations` 原值永久保留精神（憲法 §4）。
- **A113（新增，架構判斷）**：**不在 `intervention_plans.status` 欄位實際落地 `review_due` 這個狀態值**，改為由 API／UI 於讀取時計算式判斷「是否達檢討日且無進行中的檢討」（`status ∈ {active, paused}` 且 `reviewDate <= now` 且無 `status=in_review` 的既有 review）。**理由**：本專案目前沒有日期觸發的背景排程子系統（worker 僅處理文件解析等 job queue 任務），若要讓 `status` 欄位在到期當下自動轉為 `review_due` 需要新增排程機制，超出本輪範疇且風險不成比例；計算式判斷可達到相同使用者體驗（面板出現「開始檢討」提示），且不影響既有 `pausePlan`／`resumePlan`／`stopPlan` 邏輯（皆以 `active`／`paused` 為前提，不受影響）。
- **A114（新增，核心安全設計）**：`classification` 欄位為白名單列舉，逐字採用上游 §9.3 十分類（`有改善`／`部分改善`／`暫時穩定`／`尚未到檢討時間`／`執行資料不足`／`測量資料不可比較`／`計畫可能無效`／`計畫難以持續`／`出現不良反應`／`需要專業評估`），UI 呈現為下拉選單而非自由文字輸入框，API 層拒絕不在清單內的值。**理由**：延續 A62／A73／A87／A105 一貫原則——「這次執行算不算有改善」是需要使用者本人／專業判斷的問題，系統不對日常回報或症狀事件資料做語意分析來自動判定分類，只負責結構化記錄使用者自己做出的判斷。
- **A115（新增，核心安全設計）**：十分類結果對計畫狀態的影響，僅限兩類觸發轉換，其餘八類一律維持原狀態：
  - 「計畫可能無效」→ 計畫狀態轉為新增的 `ineffective`（UI 顯示維持／簡化／替代／停止／專業評估五個選項，見上游 §29 BDD「計畫無改善」情境與 SDD §4.11，**系統不自動執行任一選項**，使用者需另外呼叫既有的調整／暫停／停止端點）
  - 「需要專業評估」→ 計畫狀態轉為新增的 `escalated`（面板顯示可產生轉介摘要，**產生摘要仍需使用者另外點擊**，非自動觸發）
  - 「出現不良反應」→ 若使用者透過檢討回溯選擇此分類，比照 E5-F2 的 A105 一貫邏輯，同步呼叫既有 `stopPlan(planId, "adverse_event")`，避免同一安全語意在 review 路徑與 symptom event 路徑產生不一致行為
  - 其餘七類（有改善／部分改善／暫時穩定／尚未到檢討時間／執行資料不足／測量資料不可比較／計畫難以持續）→ 計畫狀態不變，僅記錄檢討歷史供未來參考
  **理由**：逐字落實憲法 §3「無改善不得自動增加強度／限制／保健品，不得責怪使用者」——分類結果最多觸發「狀態標記」，從未觸發任何會改變計畫內容或強度的自動行為。
- **A116（新增）**：`ineffective`／`escalated` 狀態下，計畫可透過既有的「調整」端點（版本鏈邏輯，A96／A97）建立新版本並回到 `active`（比照上游 §18.3 `adjusted→active`），即 `ADJUSTABLE_STATUSES` 由 `{active, paused}` 擴充為 `{active, paused, ineffective, escalated}`；`ineffective`／`escalated` 皆非 `TERMINAL_STATUSES`（使用者仍可對其執行暫停／停止／調整），僅 `stopped`／`archived` 維持終態。**理由**：延續既有版本鏈設計精神——「調整」本來就是「無改善後想簡化或替代方案」的具體實作路徑，若不允許從 `ineffective`／`escalated` 調整，使用者將被迫建立全新計畫，體驗與規格「顯示簡化、替代選項」的意圖不符。
- **A117（新增）**：review 建立的前置條件——僅 `status ∈ {active, paused}` 且 `reviewDate <= now` 且無既有 `in_review` 的 review 時可建立（見 A113 計算式判斷）；`draft`／`needs_info`／`stopped`／`archived` 狀態或未達檢討日時一律拒絕（`INVALID_REQUEST`）。
- **A118（新增）**：`escalation_summaries.content` 為結構化聚合既有資料（計畫基準／風險／停止條件、最近一次檢討的分類與備註、近期不良反應症狀事件摘要），**由伺服器端純程式邏輯組裝，不經過 LLM 生成**。**理由**：延續 A62（AI 不自動判讀嚴重度）與整體「安全判斷不自動化」原則的延伸——轉介摘要是要交給醫療專業人員看的文件，任何 LLM 生成內容都有幻覺風險，本輪選擇對已確認的結構化資料做純聚合展示，不引入語言模型生成環節；若未來要加入 LLM 輔助摘要語句，需獨立評估並比照 E4-F3 的安全審查規格（Streaming、引用驗證）。
- **A119（新增）**：轉介摘要僅能在計畫已產生至少一筆 `classification=需要專業評估` 的 review 時才可建立，避免使用者跳過檢討流程直接產生摘要，確保摘要內容有真實的檢討依據可回溯。
- **A120（新增）**：UI 沿用 A108／A95 既定設計語言，「定期檢討」「專業轉介摘要」併入既有 `/projects/[id]/plans` 計畫詳情面板，不建立獨立頁面；十分類下拉選單放在檢討表單內，不做成獨立精靈流程（wizard），維持與既有日常回報／症狀事件表單一致的操作模式，降低 50–65 歲使用者的學習成本。

## 12. 三層結構回溯

- Feature：**E5-F3**（E5 健康行動閉環，3/4）
- SDD：§4.11；上游 §9／§17／§18.3／§22.6／§23／§28.7／Stage 9（後半）；憲法 §3
- 前置依賴：E5-F2 ✅（Sprint 19）

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」適用（AC-10）；「日誌掃描」適用（AC-12，範圍為 `notes`／`content` 等健康敘述內容）；「LLM Streaming」不適用（本輪轉介摘要為純結構化聚合，見 A118，無 LLM 使用）。**本輪額外要求**：SPRINT_LOG 需誠實記錄「十分類結果僅觸發狀態標記，從未觸發任何自動調整行動／指標／強度的行為」「轉介摘要為純結構化聚合，非 LLM 生成」，避免使用者或後續開發者誤以為系統具備自動判斷「這樣算不算有改善」的醫學能力。
