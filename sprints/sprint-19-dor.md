# Sprint 19 DOR — E5-F2：日常回報與症狀事件模組（不良反應暫停鏈）

> 狀態：**草案，待 PO 確認 A102–A110 並通過 DOR**
> 對應：E5-F2（05_BACKLOG E5 表，🟡 風險，精估 1 個 Sprint）；SDD §4.10；上游規格 §8.1／§17／§22.6／§23／§24／§28.7／Stage 9（部分）；憲法 §3（不良反應停止後不得自動重啟）／§4
> 前置依賴：E5-F1（行動計畫與安全規則引擎）✅ 已完成（Part 1/2＋2/2 皆正式站部署驗證通過）
> 建議 Sprint 順序（05_BACKLOG）：……E5-F1 Part 1/2＋2/2（已完成）→ **E5-F2（本輪）** → E5-F3……

---

## 1. 需求描述

**範圍定位**：E5-F1 讓使用者建立「可停止的行動計畫」，E5-F2 補上執行期間的日常追蹤與安全煞車——使用者針對計畫已定義的指標記錄每日回報（`check_ins`），並在出現不舒服症狀時記錄症狀事件（`symptom_events`）。05_BACKLOG 括號標註本 Feature 核心是「不良反應暫停鏈」：症狀事件若被標記為不良反應，系統立即透過 E5-F1 已預留的原語（`stopPlan(planId, "adverse_event")`，A90）自動暫停關聯計畫。

三項交付：

1. **DB migration**：兩張新表（上游 §23）——
   - `check_ins`：`id`、`planId`（FK）、`metricId`（FK `tracking_metrics`，須驗證屬於同一 plan）、`value`（text，自由文字，見 A103）、`note`（nullable）、`checkinDate`、`status`（上游 §17 逐字：`draft`／`submitted`／`corrected`／`deleted`）、`createdAt`／`updatedAt`
   - `symptom_events`：`id`、`planId`（FK）、`description`（text, not null）、`occurredAt`、`isAdverseEvent`（boolean, default false，見 A105）、`status`（上游 §17 逐字：`open`／`monitoring`／`resolved`／`escalated`，預設 `open`）、`createdAt`／`updatedAt`
2. **服務層**（`src/modules/plans/` 擴充，或獨立子模組，實作時視程式碼組織決定）：
   - `createCheckIn()`／`updateCheckIn()`（更正）／`deleteCheckIn()`
   - `createSymptomEvent()`／`updateSymptomEvent()`（補充內容／狀態轉換／設定 `isAdverseEvent`）
   - **不良反應暫停鏈**：`isAdverseEvent` 於建立或更新時被設為 `true`，立即呼叫既有 `stopPlan(planId, "adverse_event")`（A105，核心安全設計）
3. **API 路由**（四層權限鏈延伸既有 `findOwnedPlan` 模式）：
   ```
   POST   /api/projects/{id}/plans/{planId}/check-ins
   PATCH  /api/projects/{id}/plans/{planId}/check-ins/{checkInId}
   DELETE /api/projects/{id}/plans/{planId}/check-ins/{checkInId}
   POST   /api/projects/{id}/plans/{planId}/symptoms
   PATCH  /api/projects/{id}/plans/{planId}/symptoms/{symptomId}
   ```
   （symptom events 本輪不提供 DELETE，見 A107）`getPlan()` 擴充回傳 `checkIns`／`symptomEvents`，延續 Sprint 18 內嵌 `actions`／`metrics` 的既有模式。
4. **UI**：併入既有 `/projects/[id]/plans` 頁面的計畫詳情面板，新增「日常回報」「症狀事件」兩區塊（見 A108）。

## 2. 使用者角色

專案擁有者（一般使用者）：對執行中的計畫記錄每日回報，出現不舒服症狀時回報並視情況觸發暫停。

## 3. 操作流程

使用者於計畫詳情面板 → 「日常回報」區塊選擇指標＋填寫數值 → 送出建立 check-in，可事後更正或刪除。「症狀事件」區塊描述症狀 → 若判斷為不良反應勾選對應選項 → 送出後系統自動將計畫轉為 `stopped`（若已勾選）。既有症狀事件可補充內容或轉換狀態（觀察中／已解決／需轉介）。

## 4. 輸入資料

| 輸入 | 來源 | 狀態 |
|---|---|---|
| 計畫既有指標（`tracking_metrics`） | E5-F1 已完成 | ✅ 已完成，本輪查詢使用 |
| 計畫狀態轉換原語（`stopPlan`） | E5-F1 Part 1/2（A90 已預留 `reason` 欄位） | ✅ 已完成，本輪首次實際呼叫 |
| 使用者回報數值與症狀描述 | 使用者輸入 | 待驗證輸入不可信，比照既有模式 |

## 5. 輸出結果

§1 四項交付；完成後使用者可對執行中的計畫記錄每日回報與症狀事件，症狀事件標記為不良反應時計畫自動安全暫停，且暫停後無法自動或手動重新啟用（憲法 §3 硬性規定）。

## 6. 驗收條件（Given／When／Then，草案，待 PO 確認）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（check-in 建立） | 計畫 `active`，指標存在於該計畫 | 建立 check-in | 成功，`status=submitted` |
| AC-2（check-in 拒絕情境） | 計畫 `draft`（未啟用）或 `metricId` 屬於另一計畫 | 建立 check-in | 一律拒絕（`INVALID_REQUEST`／`NOT_FOUND`） |
| AC-3（check-in 更正與刪除） | 已建立的 check-in | 呼叫 `updateCheckIn`／`deleteCheckIn` | 內容正確更新／軟刪除，`status→corrected`／`deleted` |
| AC-4（症狀事件：一般回報） | 計畫 `active` | 建立症狀事件（`isAdverseEvent=false`） | 成功建立，`status=open`，計畫狀態不受影響 |
| AC-5（不良反應暫停鏈，核心） | 計畫 `active` | 建立或更新症狀事件並設 `isAdverseEvent=true` | 症狀事件成功記錄；關聯計畫立即轉 `stopped`，`stopReason=adverse_event` |
| AC-6（停止後不得重啟，回歸確認） | 計畫因 AC-5 轉為 `stopped` | 呼叫 `resumePlan()` | 一律拒絕（狀態機本身已阻擋，非本輪新增邏輯，見 A106） |
| AC-7（症狀事件狀態轉換） | 症狀事件 `open` | 依序轉換 `monitoring`→`resolved`／`escalated` | 狀態正確轉換，皆透過 `updateSymptomEvent` |
| AC-8（四層權限鏈） | check-in／症狀事件存在專案 A | 其他帳號存取 | 一律 `PROJECT_ACCESS_DENIED` |
| AC-9（UI） | 計畫詳情面板 | 新增回報／症狀事件 | 畫面即時反映，不良反應觸發時可見計畫狀態變化 |
| AC-10（日誌 P0） | 建立／更新回報與症狀事件全流程 | 掃描日誌 | 不含 `value`／`note`／`description` 等健康敘述內容 |

**本輪 AC 範圍排除**：`plan_reviews`、無改善十分類、專業轉介摘要（皆屬 E5-F3）。

## 7. Clarify 釐清

無新增 Clarify；本輪高不確定性項目以假設方式登記（A102–A110），待 PO 於通過 DOR 時一併追認。

## 8. 可能影響的舊功能

- 計畫狀態轉換函式（`pausePlan`／`resumePlan`／`updatePlan` 的版本鏈分流）本輪新增一項錯誤碼精緻化（A110：`stopped` 且 `stopReason=adverse_event` 時回傳 `PLAN_ADVERSE_EVENT` 而非通用 `INVALID_REQUEST`），屬既有函式的訊息強化，不改變狀態轉換規則本身
- `getPlan()` 回傳型別擴充（新增 `checkIns`／`symptomEvents` 欄位），既有呼叫端（Sprint 17/18 測試、UI）需相容此擴充（僅新增欄位，非破壞性變更）

## 9. 一個 Sprint 內可完成

05_BACKLOG 精估 1 個 Sprint、風險 🟡（非 PoC）。範圍為兩張新表＋CRUD＋一條安全鏈邏輯＋UI 併入既有頁面，複雜度低於 E5-F1（無版本鏈）。**若實作中發現規模超出預期**，比照 E2-F2／E4-F3／E5-F1 PoC 拆分先例——backend＋API＋測試優先出貨，UI 延後至下一輪，並在 SPRINT_LOG 誠實記錄（A102）。

## 10. 範圍排除

- **`plan_reviews`／無改善十分類／專業轉介摘要**——屬 E5-F3「定期檢討與無改善分類模組」範圍
- **symptom events 的 DELETE 端點**——比照上游 §22.6 API 清單逐字（僅 POST／PATCH），見 A107
- **自動判讀症狀嚴重度**——`isAdverseEvent` 完全由使用者手動標記，系統不對 `description` 文字做任何語意分析來自動判定是否為不良反應，見 A105
- **停止後的計畫恢復流程**——因不良反應停止的計畫無法透過本系統任何端點恢復（憲法 §3 硬性規定），使用者若要繼續執行需建立全新計畫，本輪不提供任何變通路徑

## 11. 假設登記（待 PO 追認）

- **A102（新增）**：Sprint 19 目標涵蓋 `check_ins`／`symptom_events` 兩張新表＋服務層＋API＋UI，先嘗試在單一 Sprint 內完成（比照 05_BACKLOG 1 個 Sprint 預算）；若實作中發現規模超出預期，backend 優先出貨、UI 延後，比照既有 PoC 拆分先例處理，誠實記錄於 SPRINT_LOG。
- **A103（新增）**：`check_ins.value` 採自由文字，非強制 `numeric` 型別。**理由**：憲法 §4「健康數值須用 numeric」規範的是檢驗數值（`observations`，機器判讀／趨勢分析用途），日常回報是使用者主觀記錄（如「疲勞程度：還好」「今天走了 20 分鐘」），本質與正式檢驗數值不同，強制數值化會扭曲部分指標（如疲勞、可持續程度等主觀量表）的真實輸入。
- **A104（新增）**：`symptom_events` 狀態機依上游 §17 逐字落地（`open`／`monitoring`／`resolved`／`escalated`），預設 `open`；`check_ins` 狀態依上游 §17 逐字（`draft`／`submitted`／`corrected`／`deleted`）。
- **A105（新增，核心安全設計）**：「不良反應暫停鏈」採**使用者明確標記，非系統自動判斷嚴重度**——`isAdverseEvent` 完全由使用者手動勾選／設定，設為 `true` 時立即呼叫既有 `stopPlan(planId, "adverse_event")`（A90 預留介面）。系統不對症狀描述文字做語意分析來自動判定是否構成不良反應。**理由**：延續 A62／A73／A87 一貫原則——「這個症狀夠不夠嚴重該暫停計畫」是需要真正醫學判斷的問題，規則式或語意判讀勉強自動化，比誠實地把決定權交給使用者本人更危險（可能誤判不暫停、或過度敏感干擾正常執行）。
- **A106（新增）**：「因不良反應停止的計畫不得自動重新啟用」（憲法 §3 硬性規定）已由 E5-F1 既有狀態機邏輯滿足——`resumePlan()` 僅允許 `paused→active`，`stopped` 為終態且系統中無任何端點可將其轉回 `active`。本輪不需新增程式碼落實此規則，僅在測試中新增回歸確認（AC-6）。
- **A107（新增）**：`symptom_events` 本輪不提供 `DELETE` 端點，僅 `POST`／`PATCH`（補充內容／狀態轉換），比照上游 §22.6 API 清單逐字（僅列出 `POST`／`PATCH`，無 `DELETE symptoms`）。**理由**：症狀事件屬醫療相關歷程記錄，即使描述有誤也應保留為歷史紀錄並用 `PATCH` 補充更正，而非直接刪除，符合「原值永遠保留」精神；`check_ins` 則依上游明確列出的 `DELETE` 端點提供刪除。
- **A108（新增）**：check-ins／symptom events 的 UI 併入既有 `/projects/[id]/plans` 頁面的計畫詳情面板，新增「日常回報」「症狀事件」兩區塊，不建立獨立頁面。**理由**：延續 A95「單一入口管理計畫全生命週期」的既有設計語言，且這兩類資料在概念上都是計畫的執行期附屬記錄，與 Sprint 18 已有的行動／指標管理區塊性質相近。
- **A109（新增）**：check-ins／symptom events 僅開放於計畫狀態為 `active`／`paused` 時建立；`draft`／`needs_info`（尚未啟用執行）與 `stopped`／`archived`（已終止）狀態下拒絕新增（可檢視既有歷史紀錄，但不可新增）。**理由**：這兩類資料本質是「執行期間」的追蹤記錄，計畫未啟用或已終止時新增缺乏語意基礎。
- **A110（新增）**：既有的 `pausePlan()`／`resumePlan()`／`updatePlan()`（版本鏈調整）於計畫 `status=stopped` 且 `stopReason=adverse_event` 時，錯誤碼由通用 `INVALID_REQUEST` 精緻化為上游 §24 逐字定義的 `PLAN_ADVERSE_EVENT`（「已暫停相關行動，請先處理不舒服事件」），提供更符合情境的錯誤訊息。**理由**：上游規格明確定義此錯誤碼但 E5-F1 Part 1/2 尚無觸發情境（`stopPlan()` 剛預留 `reason` 欄位、本輪才首次實際使用），本輪為既有函式的訊息精緻化，非新增行為規則。

## 12. 三層結構回溯

- Feature：**E5-F2**（E5 健康行動閉環，2/4）
- SDD：§4.10；上游 §8.1／§17／§22.6／§23／§24／§28.7／Stage 9（部分）；憲法 §3／§4
- 前置依賴：E5-F1 ✅（Sprint 17～18）

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」適用（AC-8）；「日誌掃描」適用（AC-10，範圍為 `value`／`note`／`description` 等健康敘述內容）；「LLM Streaming」不適用（本輪無 LLM 使用）。**本輪額外要求**：SPRINT_LOG 需誠實記錄「`isAdverseEvent` 完全由使用者手動標記，系統不自動判讀症狀嚴重度」「因不良反應停止的計畫無任何恢復路徑，屬刻意設計非疏漏」，避免使用者或後續開發者誤以為系統具備自動辨識不良反應的醫學判斷能力。
