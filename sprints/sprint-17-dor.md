# Sprint 17 DOR — E5-F1：行動計畫與安全規則引擎（Part 1/2）

> 狀態：**✅ 通過（PO：確認通過 DOR）**
> 對應：E5-F1（05_BACKLOG E5 表，🔴 風險「醫療安全核心」、精估 2 個 Sprint，無 PoC 標記但風險最高）；SDD §4.10；上游規格 §8／§8.1／§9／§17／§18.3／§19／§22.6／§23／§24／§28.7／Stage 8；憲法 §3（醫療安全底線）／§4（版本與原值保留）
> 前置依賴：E1-F5（個人健康背景，`health_profiles`）✅ 已完成
> 建議 Sprint 順序（05_BACKLOG）：……E4-F3(PoC)×2 → **E5-F1×2** → E5-F2……——本輪規模與風險（醫療安全核心）較大，拆為 Part 1/2（本輪：資料模型＋服務層＋API，不含 UI）＋ Part 2/2（下一輪：UI＋完整驗收），比照 E2-F2／E4-F3 PoC 拆分先例

---

## 1. 需求描述

**範圍定位**：E5-F1 是 E5 健康行動閉環的第一個 Feature，把使用者從「看到健康戰情」推進到「建立可執行、可停止的行動計畫」。上游 §8 完整閉環為：**健檢資料 → 問題辨識 → 證據與衝突說明 → 安全檢查 → 小步驟行動計畫 → 日常回報 → 定期檢討 → 維持／調整／停止／轉介 → 下一次健檢重新驗證**。E5-F1 對應閉環中「安全檢查」與「小步驟行動計畫」兩節點——**本 Feature 的核心不是「計畫內容有多豐富」，而是「啟用前的安全把關是否確實」**（05_BACKLOG 風險標記為「醫療安全核心」而非技術不確定性）。

**本輪（Part 1/2）聚焦於資料模型、安全審查邏輯與 API，不含 UI**：計畫的建立、必要安全欄位與三分類指標、啟用審查（`activate`）、暫停／恢復／停止的狀態轉換、四層權限鏈。使用者可透過 API／整合測試操作完整流程；UI 頁面留待 Part 2/2。

三項交付：

1. **DB migration**：三張新表（上游 §23）——
   - `intervention_plans`：`id`、`projectId`（FK，四層鏈第 1 層資源）、`title`、`baseline`（基準，nullable——draft 階段允許不完整，比照上游 Stage 8「autosave」精神）、`riskNote`（風險，nullable）、`stopCondition`（停止條件，nullable）、`referralCondition`（轉介條件，nullable）、`reviewDate`（date，nullable）、`status`（見 A85）、`stopReason`（nullable，`user_choice`／`adverse_event`，見 A90）、`previousVersionId`（nullable 自我參照 FK，為 Part 2/2 版本鏈預留，本輪不使用，見範圍排除）、`version`（預設 1）、`createdAt`／`updatedAt`／`deletedAt`（軟刪除）
   - `intervention_actions`：`id`、`planId`（FK）、`description`（text, not null）、`category`（nullable text，自由文字非 enum，比照 `health_profiles` A16 精神不過度正規化）、`createdAt`／`updatedAt`／`deletedAt`
   - `tracking_metrics`：`id`、`planId`（FK）、`category`（`leading`／`outcome`／`safety` 三值，上游 §8.1 逐字分類）、`name`（text, not null）、`description`（nullable）、`createdAt`／`updatedAt`／`deletedAt`
2. **計畫服務層**（`src/modules/plans/`）：
   - `createPlan()`：建立 draft，安全欄位可留空
   - `updatePlan()`：僅 `draft`／`needs_info` 狀態下可就地編輯（autosave 友善；已啟用計畫的編輯留待 Part 2/2，見 A89／範圍排除）
   - `addAction()`／`removeAction()`、`addMetric()`／`removeMetric()`：子資源皆須驗證歸屬同一 plan（見 AC-8）
   - `activatePlan()`：**結構化安全檢查**（見 A87）——`baseline`／`riskNote`／`stopCondition`／`referralCondition`／`reviewDate` 皆非空，且 `leading`／`outcome`／`safety` 三分類指標各至少一筆；不足則 `status→needs_info`＋回傳 `PLAN_SAFETY_INFO_REQUIRED`（上游 §24 逐字錯誤碼）＋缺漏欄位清單；通過則 `status→active`
   - `pausePlan()`／`resumePlan()`：`active↔paused`
   - `stopPlan(reason)`：任一非終態→`stopped`，記錄 `stopReason`（見 A90，本輪僅提供原語 API，不含不良反應自動觸發鏈）
   - `deletePlan()`：軟刪除
3. **API 路由**（四層權限鏈比照既有模組模式）：
   ```
   POST   /api/projects/{id}/plans
   GET    /api/projects/{id}/plans
   GET    /api/projects/{id}/plans/{planId}
   PATCH  /api/projects/{id}/plans/{planId}
   DELETE /api/projects/{id}/plans/{planId}
   POST   /api/projects/{id}/plans/{planId}/activate
   POST   /api/projects/{id}/plans/{planId}/pause
   POST   /api/projects/{id}/plans/{planId}/resume
   POST   /api/projects/{id}/plans/{planId}/stop
   POST   /api/projects/{id}/plans/{planId}/actions
   DELETE /api/projects/{id}/plans/{planId}/actions/{actionId}
   POST   /api/projects/{id}/plans/{planId}/metrics
   DELETE /api/projects/{id}/plans/{planId}/metrics/{metricId}
   ```

## 2. 使用者角色

專案擁有者（一般使用者）：為自己的健康專案建立行動計畫，填妥安全資訊後啟用，之後可暫停／恢復／停止。

## 3. 操作流程

使用者於工作區選擇專案 → 建立計畫草稿（標題＋基準／風險／停止條件／轉介條件／檢討日，可先不填）→ 新增行動與指標（三分類各至少一筆）→ 呼叫啟用 → 系統檢查安全資訊完整性 → 通過則計畫進入 `active`，不通過則列出缺漏並停留 `needs_info`（本輪無 UI，見 A88，以整合測試模擬操作）→ 之後可暫停／恢復／停止。

## 4. 輸入資料

| 輸入 | 來源 | 狀態 |
|---|---|---|
| 計畫基本欄位（標題／基準／風險／停止條件／轉介條件／檢討日） | 使用者輸入 | 待驗證輸入不可信，比照既有模式 |
| 行動與指標 | 使用者輸入 | 同上 |
| 個人健康背景（`health_profiles`） | E1-F5 既有 | ✅ 已完成；本輪**不**對其內容做語意判讀（見 A87） |

## 5. 輸出結果

§1 三項交付；完成後使用者可透過 API 建立、編輯、啟用（含安全審查）、暫停、恢復、停止行動計畫，且啟用前的安全資訊完整性有結構化把關，符合本 Feature「醫療安全核心」的風險定位。

## 6. 驗收條件（Given／When／Then，草案，待 PO 確認）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（狀態機欄位） | `intervention_plans` 資料表 | 檢查欄位定義 | `status` 涵蓋本輪落地子集（見 A85），預設 `draft` |
| AC-2（建立草稿） | 專案擁有者 | 建立計畫僅填標題，安全欄位留空 | 建立成功，`status=draft` |
| AC-3（安全檢查通過） | 計畫已填妥全部必要安全欄位＋三分類指標各至少一筆 | 呼叫 `activate` | 成功，`status→active` |
| AC-4（安全檢查不通過：欄位缺漏） | 計畫缺少 `stopCondition` | 呼叫 `activate` | 回傳 `PLAN_SAFETY_INFO_REQUIRED`＋缺漏清單含 `stopCondition`，`status→needs_info`，未寫入 `active` |
| AC-5（安全檢查不通過：指標缺漏） | 計畫欄位齊全但無 `safety` 分類指標 | 呼叫 `activate` | 同上，缺漏清單含缺少的指標分類，未啟用 |
| AC-6（暫停／恢復） | 計畫 `active` | 依序呼叫 `pause`→`resume` | 狀態正確轉換為 `paused`→`active`；`draft` 狀態呼叫 `pause` 應拒絕 |
| AC-7（停止） | 計畫任一非終態 | 呼叫 `stop`（帶 `reason`） | `status→stopped`，`stopReason` 正確記錄；`stopped` 狀態不可再轉換（終態） |
| AC-8（子資源歸屬與四層鏈） | action／metric 存在於專案 A 的計畫 | 專案 B 或非擁有者嘗試操作 | 一律 `PROJECT_ACCESS_DENIED`，比照既有模式延伸至子資源 |
| AC-9（軟刪除） | 已刪除計畫 | 列表查詢 | 不出現在預設列表；直接查詢單筆回 `NOT_FOUND` |
| AC-10（日誌 P0） | 建立／編輯／啟用計畫全流程 | 掃描日誌 | 不含 `baseline`／`riskNote`／`stopCondition`／`referralCondition`／行動與指標描述等健康敘述內容 |

**本輪 AC 範圍排除**：UI 互動驗證、已啟用計畫的欄位編輯與版本鏈、`review_due` 之後的檢討結果分類、不良反應自動暫停鏈——留待 Part 2/2 或後續 Feature（E5-F2／E5-F3）。

## 7. Clarify 釐清

無新增 Clarify；本輪高不確定性項目以假設方式登記（A84–A93），待 PO 於通過 DOR 時一併追認。

## 8. 可能影響的舊功能

無直接修改——三張新表皆全新；讀取既有 `health_profiles` 僅作為前端未來可能的參考展示（本輪服務層不查詢其內容），不變更其邏輯。

## 9. 一個 Sprint 內可完成

05_BACKLOG 精估 2 個 Sprint、風險 🔴 醫療安全核心。本輪已限縮為「資料模型＋安全審查核心邏輯＋狀態轉換 API」，不含 UI／已啟用計畫的版本鏈／檢討結果／不良反應自動鏈，符合單 Sprint Part 1/2 的合理範圍。

## 10. 範圍排除

- **UI／前端頁面**——本輪純後端＋API，比照 E4-F3 PoC 1/2（A75）「先證明後端邏輯可行，UI 留給下一階段」模式，透過整合測試直接呼叫服務層／API 驗證
- **已啟用計畫的欄位編輯與版本鏈**（上游 §19「行動計畫修改建立新版本」／§18.3「調整建立新版本」）——本輪 `active` 後僅開放 `pause`／`resume`／`stop` 狀態轉換，不開放核心安全欄位編輯；`previousVersionId` 欄位本輪僅預留，邏輯留待 Part 2/2
- **`review_due` 之後的檢討結果分類**（`adjusted`／`completed`／`ineffective`／`escalated`，上游 §9.3 十分類、Gherkin「計畫無改善」）——屬 E5-F3「定期檢討與無改善分類模組」範圍，本輪 `review_due` 僅為狀態機占位，無自動排程觸發、無檢討結果邏輯
- **日常回報／症狀事件／不良反應自動暫停鏈**（`check_ins`／`symptom_events`）——屬 E5-F2「日常回報與症狀事件模組」範圍；本輪 `stopPlan(reason)` 僅提供狀態轉換原語（含 `stopReason` 欄位供未來串接），非自動觸發
- **AI 輔助產生計畫草稿**——05_BACKLOG E5-F1 命名未提及 AI／Streaming；上游 §18.3「所有 AI 產生的計畫草稿必須 Streaming」為系統通用規則（憲法 §3 延伸），非本 Feature 必須用 AI 生成計畫的強制要求。本輪計畫完全由使用者手動輸入
- **對 `health_profiles` 內容的語意判讀**——安全審查僅檢查計畫自身欄位完整性，不對使用者健康背景 jsonb 內容做正確性或充分性的語意判斷，見 A87
- **看診摘要／轉介摘要／匯出**（`escalation_summaries`，§22.6 API 群組雖與 plans 並列，但屬 E5-F3／E5-F4 概念範圍）

## 11. 假設登記（待 PO 追認）

- **A84（新增）**：E5-F1 拆分為 Part 1/2（本輪，Sprint 17）＋ Part 2/2（Sprint 18）。**理由**：05_BACKLOG 本身已估 2 個 Sprint、風險標記 🔴 醫療安全核心；比照 E2-F2／E4-F3 PoC 拆分先例，本輪聚焦資料模型與安全審查核心邏輯，UI／版本鏈／完整驗收留待下一輪。
- **A85（新增）**：`intervention_plans.status` 本輪落地上游 §18.3 狀態機的子集——`draft`／`needs_info`／`safety_review`／`active`／`paused`／`stopped`／`review_due`／`archived`（型別涵蓋 `safety_review`，但本輪 `activatePlan()` 為同步結構檢查，不會讓計畫實際停留在 `safety_review` 狀態——通過即直接進 `active`，失敗回 `needs_info`；`safety_review` 保留於型別是為未來若加入人工／二次審查流程時不需 migration，本輪不產生該狀態的實際資料）。`adjusted`／`completed`／`ineffective`／`escalated` 不在本輪型別範圍（屬 E5-F3）。
- **A86（新增）**：三張新表皆掛專案層級（`intervention_plans.projectId` 直接外鍵；`intervention_actions`／`tracking_metrics` 透過 `planId` 間接歸屬），四層權限鏈比照 `documents`／`observations`／`conversations` 既有模式。
- **A87（新增，核心設計決策）**：`activatePlan()` 的「安全審查」採**結構化欄位完整性檢查**，非語意判讀——檢查計畫自身欄位（`baseline`／`riskNote`／`stopCondition`／`referralCondition`／`reviewDate`）皆非空，且 `tracking_metrics` 中 `leading`／`outcome`／`safety` 三分類各至少一筆。**不**對使用者的 `health_profiles`（自由 jsonb，A16）內容做「背景資訊是否充分／正確」的語意判斷。**理由**：延續 A62（`conflictStatus` 人工標記非系統判定）／A73／A74（結構性而非語意驗證）一貫原則——健康背景是否「足夠支撐這個計畫安全」需要真正的醫學判斷，規則式或 AI 語意判讀勉強做這件事，比誠實地要求使用者自己在計畫中明確寫下基準／風險／停止條件／轉介條件（並確保有安全指標可監測）更危險，會給使用者「系統已經幫我把關過健康背景」的虛假安全感。結構化必填欄位本身就是把「使用者自己想清楚這些安全問題」的責任內建進流程，而非系統代為判斷。
- **A88（新增）**：本輪不建立 UI，透過整合測試直接呼叫服務層／API 驗證。**理由**：比照 E4-F3 PoC 1/2（A75）「先證明後端邏輯可行，UI 留給下一階段」模式；計畫建立表單＋子資源（行動／指標）管理＋狀態轉換按鈕的 UI 工程量不小，且需等安全審查邏輯確認可行後再投入才不會白工。
- **A89（新增）**：已啟用（`active`／`paused`／`review_due`）計畫的核心安全欄位本輪**不開放編輯**，僅開放 `pause`／`resume`／`stop` 狀態轉換；`previousVersionId` 欄位本輪僅預留，版本鏈邏輯（上游 §19「修改建立新版本」）留待 Part 2/2 實作。**理由**：範圍控制——版本鏈設計（新增列＋前版標記／自我參照鏈的具體規則）需要額外設計決策，且已啟用計畫的編輯不是本輪「安全審查是否有效把關」核心驗證目標所必需，留待 Part 2/2 與 UI 一併設計會更貼近實際編輯情境（例如哪些欄位可調、哪些不可調）。
- **A90（新增）**：`stopPlan(reason)` 本輪僅提供狀態轉換原語，`reason` 欄位值為 `user_choice`／`adverse_event`（供 API 呼叫者標記），但**不含**「症狀事件觸發自動暫停」的偵測與觸發邏輯。**理由**：不良反應自動暫停鏈（`PLAN_ADVERSE_EVENT` 錯誤碼、上游 §28.7「不良反應時立即暫停」）需要 `symptom_events` 資料存在才能判斷觸發時機，屬 E5-F2「日常回報與症狀事件模組」範圍；本輪提供的 `reason` 欄位是為 E5-F2 未來呼叫 `stopPlan("adverse_event")` 預留介面，非本輪自行判斷。
- **A91（新增）**：`intervention_actions.category` 採自由文字（nullable text），不做 enum 或固定分類。**理由**：比照 `health_profiles`（A16）與既有克制正規化的精神——上游未定案到可直接開 enum 的細緻度（運動／飲食／睡眠／其他的邊界因人而異），過度正規化等於本輪自行擴權定案未決事項。
- **A92（新增）**：`tracking_metrics.category` **採 enum 而非自由文字**（`leading`／`outcome`／`safety`），與 A91 的 `intervention_actions.category` 設計不同。**理由**：上游 §8.1 明確定義三分類且為 A87 安全審查邏輯的判斷依據（需要精確比對是否三類皆有），與 `intervention_actions.category` 純粹描述性用途不同，需要程式邏輯可靠識別，不能是自由文字。
- **A93（新增）**：`escalation-summary`（上游 §22.6 API 群組列於 plans 底下，但無獨立資料表——`escalation_summaries` 屬其他 Feature）本輪不實作。**理由**：與 Sprint 15 A77 判斷邏輯一致——依 §23 主要資料表清單，`escalation_summaries` 概念上屬於檢討／轉介流程（E5-F3），僅是 URL 路徑掛在 `/plans/{id}/` 底下，非本 Feature 資料模型範圍。

## 12. 三層結構回溯

- Feature：**E5-F1**（E5 健康行動閉環，1/4，Part 1/2）
- SDD：§4.10；上游 §8／§8.1／§9／§17／§18.3／§19／§22.6／§23／§24／§28.7／Stage 8；憲法 §3／§4
- 前置依賴：E1-F5 ✅

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」適用（AC-8）；「日誌掃描」適用（AC-10，範圍為計畫與行動／指標的健康敘述文字）；「LLM Streaming」本輪不適用（無 LLM 使用，見範圍排除）。**本輪額外要求**：SPRINT_LOG 需誠實記錄「安全審查為結構化欄位完整性檢查，非對健康背景內容的語意判讀」「已啟用計畫本輪不可編輯，版本鏈留待 Part 2/2」「無 UI，透過整合測試驗證」，避免使用者或後續開發者誤以為系統已對計畫安全性做出醫學判斷。
