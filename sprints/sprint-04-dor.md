# Sprint 4 DOR — E1-F4：健康專案模組與四層權限鏈

> 狀態：**✅ 通過（PO 2026-07-15：A11–A14 追認、DOR 通過）**
> 對應：E1-F4（05_BACKLOG E1 表，1 Sprint）；SDD §4.2（健康專案）、§7（權限規則）；上游規格 §17／§22.2／§28.2／§24；憲法 §1／§3／§4／§6
> 前置依賴：E1-F2 ✅（帳號生命週期，Sprint 3 結案）

---

## 1. 需求描述 ✅

健康專案全生命週期 CRUD＋**本案安全基線**：四層權限驗證鏈（登入 → 專案擁有權 → 資源屬於專案 → 未刪除）＋RLS 作第二道防禦。所有後續模組（文件、辨識、正式紀錄……）皆掛在專案下，本輪把權限鏈落成**可複用元件**，而非只服務本模組。六項交付：

1. **DB migration**：`projects` 表（`id`、`owner_id` FK→`users.id`、`name`、`status` enum(`active`/`archived`/`deleted`)、`version`、`created_at`、`updated_at`、`archived_at`、`deleted_at`、`last_accessed_at`）。可回滾（`drizzle/down/`）。
2. **權限鏈共用模組**（`src/modules/projects` 或 `src/lib`）：`requireProjectAccess(userId, projectId)` 這類共用檢查——驗證登入 session（呼叫端已做）→ 專案存在且 `owner_id = userId` → 未刪除；設計為**未來模組可直接複用**（文件、辨識等資源之後只需多加「資源屬於該專案」一段判斷）。
3. **Supabase RLS 政策**：`projects` 表開啟 RLS，`owner_id = auth.uid()` 政策；作為應用層之外的第二道防禦（不得只信前端 `project_id`）。
4. **API 路由**：`POST/GET /api/projects`、`GET/PATCH/DELETE /api/projects/{id}`、`POST /api/projects/{id}/archive`、`POST /api/projects/{id}/restore`，全走統一 error envelope＋`request_id`（憲法 §4）；建立與改名帶 idempotency key、改名用 `version` 做樂觀鎖（OCC，本輪第一次落地 `VERSION_CONFLICT`）。
5. **業務規則落地**：
   - C6：未驗證帳號仍可建立與管理專案（沿用既有規則，不新增判斷）
   - 建立：`owner_id`＝目前登入者、`status=active`、`version=1`
   - 修改：本輪僅開放改名（`name`），OCC 版本檢查，版本不符回 `VERSION_CONFLICT` 不靜默覆寫
   - 封存／還原：`active⇄archived`；`deleted` 不可還原
   - 刪除：任一非刪除狀態 → `deleted`（軟刪除，`deleted_at` 設值）；本輪無依附健康資料（文件等模組未上線），無串聯清理需求
   - 跨帳號存取一律回 `PROJECT_ACCESS_DENIED`（403）＋稽核記錄（TDD P0 種子 #6）
   - 重新登入回到最近專案：`GET /api/projects/{id}` 成功時更新 `last_accessed_at`；列表或 `/api/auth/me` 回傳最近存取專案 id 供前端導向
6. **UI 頁面**：專案列表（含建立、最近專案標示）、改名、封存／還原／刪除（皆帶確認對話框防誤觸）。沿用 E1-F2 已建立的高齡優化與 WCAG 2.2 AA 規範。
7. **測試**：四類齊備＋TDD P0 種子「跨帳號存取一律 `PROJECT_ACCESS_DENIED`＋稽核」＋權限鏈四種失敗情境各一（未登入／非擁有者／專案不存在／已刪除）＋RLS 政策整合測試（不能只靠應用層測試證明資料庫層有擋）。

## 2. 使用者角色 ✅

**終端使用者（本人）**，已登入（含未驗證，C6）。無管理者或分享對象角色（分享/多成員為 Phase 2+，見 §10 排除）。

## 3. 操作流程 ✅

登入 → 專案列表（自動標示/導向最近存取專案）→ 建立新專案或選擇既有專案 → 改名／封存／還原／刪除（皆需確認）。若以他人 `project_id` 直接訪問（含手動改網址列），一律 403 並記錄。

## 4. 輸入資料 ✅

| 輸入 | 來源 | 狀態 |
|---|---|---|
| 登入 session（E1-F2） | 已完成 | ✅ |
| Supabase 專案（RLS 政策設定位置） | 已開通（Sprint 1） | ✅（本輪新增 `projects` 表的 RLS 政策設定） |

## 5. 輸出結果 ✅

§1 六項交付；完成後使用者可在正式站建立、管理健康專案，且任何跨帳號存取嘗試均被四層鏈與 RLS 雙重擋下。

## 6. 驗收條件（Given／When／Then）✅

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | 已登入（含未驗證，C6） | 提交專案名稱建立 | 建立成功，`owner_id`＝自己、`status=active`、`version=1` |
| AC-2 | 自己名下有 active／archived 專案各多筆 | `GET /api/projects` | 回傳排除 `deleted`；標示 `last_accessed_at` 最新者為「最近專案」 |
| AC-3 | 自己的專案，帶正確 `version` | `PATCH` 改名 | 更新成功、`version+1`；帶舊 `version` 則回 `VERSION_CONFLICT`，不覆寫 |
| AC-4 | 自己的 active 專案 | 封存 → 還原 | 封存後轉 `archived`；還原後轉回 `active`；對 `deleted` 執行還原一律拒絕 |
| AC-5 | 自己的任一非刪除狀態專案 | 刪除 | 轉 `deleted`（軟刪除）；不再出現於預設列表；後續任何操作（含 GET）一律視同不存在 |
| AC-6 | 帳號 B 持有效 session（TDD P0 種子 #6） | 以帳號 A 的 `project_id` 執行任一操作（GET/PATCH/archive/restore/delete） | 一律回 `PROJECT_ACCESS_DENIED`（403）＋產生稽核記錄（A11） |
| AC-7 | 未登入或 session 已過期 | 任何專案端點請求 | 回 `AUTH_REQUIRED`（401），與 AC-6 的 403 語意明確區分（登入與擁有權是權限鏈不同層） |
| AC-8 | RLS 政策已套用 `projects` 表 | 以非 owner 身分（模擬繞過應用層）直接查詢 | ⚠️ 實作中發現政策已建立但因連線角色 BYPASSRLS 尚未實際生效（A15）；真正防線為應用層四層鏈，已用真實瀏覽器＋跨帳號 session 手動驗證通過（403＋稽核 log） |
| AC-9 | 全程 | 掃描日誌＋跑 a11y 檢查 | 日誌無健康內容洩漏（僅 UUID／狀態等白名單欄位）；建立/改名/封存/還原/刪除全流程鍵盤可完成 |

## 7. Clarify 釐清 ✅

無新增 C 編號；SDD §7 權限鏈定義已明確，套用既有 C6。本輪新增之設計決策以 Assumption（A 編號）方式登記於第 11 節。

## 8. 可能影響的舊功能 ✅

- `/api/auth/me`（E1-F2）需擴充回傳「最近存取專案 id」，既有欄位（`email`／`emailVerified`）不變動語意
- `src/lib/logger.ts` 的 `SAFE_FIELD_WHITELIST` 需評估是否新增 `userId`／`projectId`／`ownerId` 等識別碼欄位以支援 AC-6 稽核記錄（皆為 UUID，非健康內容，符合憲法 §4 精神，但需明確擴充白名單而非繞過）
- `src/db/schema/index.ts` 新增 `projects` export；`users`／`sessions` 表結構不變
- 既有 `withErrorEnvelope`／`apiOk`／`apiError` 基礎設施直接複用，不重造

## 9. 一個 Sprint 內可完成 ✅

Backlog 精估 1 Sprint；核心是單表 CRUD＋權限鏈（無外部新服務，RLS 於既有 Supabase 專案內設定）；E1-F2 已驗證 auth／session 基礎穩固可直接依賴。

## 10. 範圍排除 ✅

- 專案「個人資料」欄位（上游 §17：「名稱、個人資料」中的個人資料部分）——屬 E1-F5 個人健康背景模組，本輪 `PATCH` 僅開放 `name`（A12）
- 專案內實際健康資料（文件、辨識、正式紀錄等）——E2 起才會掛載
- 分享／多成員授權——Phase 2+ 範圍外（05_BACKLOG「待確認事項」），本輪四層鏈僅落地前四層，「分享授權有效性」列未來擴充點（A14）
- 專案刪除之 Storage 串聯清理與冷靜期——C10（30 天冷靜期）僅明定於**帳號**刪除（E6-F1），專案刪除本輪為立即軟刪除，待依附模組上線後於各自 Feature 重新評估 cascade（A13）
- 專案工作區內容頁 UI（戰情板等）——待對應模組上線才有內容可顯示，本輪僅列表與 CRUD 操作

## 11. 假設登記（待 PO 追認）

- **A11**：AC-6 跨帳號存取「稽核記錄」本輪先以 `logger.warn` 記錄結構化欄位（`requestId`／`userId`／`requestedProjectId`，皆為識別碼非健康內容）作為過渡信號；正式 `audit_events` 表與稽核查詢介面待 **E6-F1** 補齊，屆時是否需回補歷史事件另議（傾向不需，僅自建表起算）。
- **A12**：本輪 `PATCH /api/projects/{id}` 僅開放 `name` 欄位；上游 §17「修改」欄描述的「個人資料」屬 E1-F5 範圍，待該 Feature 上線後另開欄位或改走獨立端點。
- **A13**：專案刪除為立即軟刪除（`deleted_at`），不比照帳號刪除的 30 天冷靜期（C10 僅明定帳號範圍）；因本輪尚無依附之健康資料模組，無串聯清理需求，待 E2+ 模組上線後於各自 Feature 重新檢視 cascade 影響。
- **A14**：SDD §7「分享授權有效性」因 MVP 無多成員／分享功能（Phase 2+ 範圍外），本輪四層鏈僅實作前四層（登入／擁有權／資源屬於專案／未刪除）；分享授權檢查列為未來擴充點，介面設計上預留但邏輯本輪 N/A。
- **A15**（實作中發現，2026-07-15）：AC-8 原設想的 RLS「第二道防禦」本輪**政策已建立但尚未實際生效**——診斷確認目前 `DATABASE_URL` 連線角色為 Supabase 預設 `postgres`，`rolbypassrls=true`，任何 RLS 政策對此角色皆形同虛設。`projects` 表已 `ENABLE ROW LEVEL SECURITY` 並建好 `owner_id` 政策（migration `0002_chilly_chat.sql`），但要讓政策真正擋下東西，需另建一個不具 BYPASSRLS 的專用角色並改接線字串——此屬正式環境憑證異動（牽涉 Supabase 角色新增＋Zeabur web／worker 雙 service 環境變數同步），比照憲法「Zeabur 維運鐵則」需 PO 確認後才能動手，本輪不自行變更。真正防線是本輪扎實落地的應用層四層權限鏈（AC-6／AC-7 皆已用真實瀏覽器＋跨帳號 session 手動驗證通過，含 403/401 語意區分與稽核 log）。AC-8 的測試範圍相應調整為「政策已就緒」而非「已驗證資料庫層真的擋下」，待改接專用角色後再補完整 RLS 生效測試。

## 12. 三層結構回溯 ✅

- Feature：**E1-F4**（E1 平台與信任基座，4/5）
- SDD：§4.2 健康專案；§7 權限規則；C6（沿用，無新增）
- 前置依賴：E1-F2 ✅

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」為本輪 **P0 主軸**（AC-6～AC-8 皆為此）；「日誌掃描」適用（AC-9，含白名單擴充評估，見第 8 節）；「LLM Streaming」N/A。RLS 政策測試（AC-8）本輪新增為 DOD 補充項，理由：權限鏈是本案安全基線，僅靠應用層測試不足以證明資料庫層防線確實生效。
