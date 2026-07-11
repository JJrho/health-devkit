# Sprint 1 DOR — E1-F1 前半：技術棧 PoC 驗證線

> 狀態：**✅ 通過（PO 2026-07-12：A1–A3 追認、§0 切分認可、DOR 通過）**
> 對應：E1-F1「技術棧 PoC 與專案骨架」（05_BACKLOG E1 表）前半；SDD §12；Clarify C1／C2／C5
> 依 06_DOR_DOD 檢查表逐項填寫；方法論 v1.2.0 第 9 節

---

## 0. E1-F1 兩個 Sprint 的切分（PO 認可事項）

| Sprint | 範圍 | 一句話目標 |
|---|---|---|
| **Sprint 1（本 DOR）** | 技術棧 PoC 驗證線 | 證明「Next.js＋TS＋Drizzle＋Supabase 東京 PG（含 pgvector）＋PG queue Worker＋測試框架」這條線端到端能跑通 |
| Sprint 2（另立 DOR） | 骨架完備 | CI（GitHub Actions）＋Zeabur Web/Worker 兩 service 部署＋OpenAPI 3.1 基座＋error envelope/request_id＋結構化日誌與 redaction 基線＋runbook 起頭 |

切分原則：Sprint 1 消除「首用技術棧」🔴 風險（Backlog 標記 PoC 的原因）；Sprint 2 把驗證過的線收斂成可持續開發的骨架。

---

## 1. 需求描述 ✅

建立本專案的程式基礎並驗證技術棧可行性。具體交付：

1. **Next.js（App Router）＋ TypeScript ＋ Tailwind 專案**：單一 app＋領域資料夾的簡化模組化單體（C1）；命名規則依憲法 §2（檔案 kebab-case／DB snake_case 等）。
2. **Drizzle ORM 連線 Supabase 東京 PG**：使用 pooler 連線字串；第一個 migration 含 (a) 啟用 pgvector extension、(b) 一張 PoC 用 `queue_jobs` 表；migration 可執行且**可回滾**（SDD §11 可維護性）。
3. **Adapter 介面群**（憲法 §1：外部服務一律經 Adapter）：定義 Auth／Storage／Queue／OCR／LLM 五個 TypeScript interface；**本 Sprint 僅 Queue 有實作**，其餘四個只有介面定義（各自的實作延至對應 Feature，不預先實作＝不過度設計）。
4. **PG Queue PoC**（C2）：QueueAdapter 的 PostgreSQL 實作＋長駐 Worker 程序——enqueue → Worker 撿起（`FOR UPDATE SKIP LOCKED`或等效機制）→ 完成標記；含失敗路徑（工作拋錯 → 標記 failed、保留重試計數欄位）。
5. **測試框架跑通**：Vitest＋Testing Library（單元）、Playwright（e2e smoke：首頁渲染）。
6. **`.env.example`**：列出四項 Supabase 變數（DATABASE_URL／SUPABASE_URL／SUPABASE_ANON_KEY／SUPABASE_SERVICE_ROLE_KEY）＋開發指南（README 開發區塊：clone → 填 env → migrate → dev → test 五步）。

## 2. 使用者角色 ✅

本 Sprint 無終端使用者功能。角色＝**開發者（AI Agent）與 PO（驗收者）**。SDD §2 的使用者角色自 E1-F2 起才進場。

## 3. 操作流程 ✅

開發者流程（即驗收流程）：
`git clone` → 依 `.env.example` 填本機 `.env`（金鑰由 PO 持有，不進 git）→ 安裝依賴 → `db:migrate` → `dev` 起 Web → 起 Worker → 跑 `test`／`test:e2e` → 全綠。

## 4. 輸入資料 ✅

| 輸入 | 來源 | 狀態 |
|---|---|---|
| Supabase 東京專案＋四項金鑰 | PO 本機持有 | ✅ 備妥（2026-07-11） |
| GitHub repo（JJrho/health-devkit） | 已建立、Supabase GitHub 整合已連 | ✅ |
| Zeabur 帳號 | PO 已有 | ✅（部署在 Sprint 2 才用） |

## 5. 輸出結果 ✅

§1 的六項交付物，全部進 repo（`.env` 除外）。無 UI 頁面交付（僅 smoke 用首頁佔位）。

## 6. 驗收條件（Given／When／Then）✅

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | 乾淨 clone＋照 `.env.example` 填妥金鑰 | 執行安裝與 `db:migrate` | migration 成功；再執行 rollback 指令可完整回滾；DB 內 pgvector extension 為啟用狀態 |
| AC-2 | migration 完成 | 啟動 dev server 並開啟首頁 | HTTP 200、頁面渲染、無 console error |
| AC-3 | Worker 已啟動 | 經 QueueAdapter enqueue 一筆測試工作 | Worker 於 10 秒內撿起並標記 completed |
| AC-4 | Worker 已啟動 | enqueue 一筆會拋錯的工作 | 標記 failed、重試計數遞增、Worker 不崩潰、日誌無敏感內容 |
| AC-5 | 專案根目錄 | 執行 Vitest 與 Playwright | 全數通過（Vitest 至少含 queue 流程單元測試；Playwright 至少含首頁 smoke） |
| AC-6 | 專案根目錄 | 執行 typecheck＋lint | 通過；且 adapter 層以外無任何 vendor SDK 直接 import（lint 規則或等效檢查把關，憲法 §1） |

## 7. Clarify 釐清 ✅

C1（單一 app 模組化單體）、C2（PG queue 起步）、C5（Supabase 東京＋Zeabur Tokyo）均已定案並寫回 SDD §17 與 04_TECHNICAL_SPEC §3。本 Sprint 無未決 Clarify。

## 8. 可能影響的舊功能 ✅

無既有程式碼（greenfield）。唯一注意：**repo 既有 14 份文件與 archive/ 不得移動或破壞**；程式碼與文件共存於同一 repo 根目錄（見 §11 假設 A1）。

## 9. 一個 Sprint 內可完成 ✅

E1-F1 精估 2 Sprint，本 DOR 只取前半（§0 切分表）；六項交付物皆為骨架級，無業務邏輯。

## 10. 範圍排除 ✅

以下明確**不在**本 Sprint：

- 註冊／登入／session（E1-F2）、Google OAuth（E1-F3）
- 任何健康資料表、RLS、四層權限鏈（E1-F4——本 Sprint 唯一的表是 `queue_jobs`，不含健康內容）
- 上傳／Storage bucket（E2-F1）、PDF 解析（E2-F2）、OCR（C4 延後）
- LLM 呼叫（E4-F3 才需要 key）
- CI、Zeabur 部署、OpenAPI 基座、日誌 redaction 基線（**Sprint 2**）
- 正式 UI／設計系統（僅 smoke 佔位頁）

## 11. 假設登記（待 PO 於 DOR 核對時追認）

- **A1**：程式碼與文件**同一 repo**（JJrho/health-devkit）——理由：Supabase GitHub 整合已連本 repo，套用 DB migration 需程式碼與 `migrations/` 在此；文件維持根目錄編號檔不動，程式碼以標準專案結構共存。
- **A2**：Node.js LTS＋pnpm 為套件管理（未在憲法列明，屬慣例預設）。
- **A3**：`queue_jobs` 表結構為 PoC 級（id／type／payload jsonb／status／retry_count／時間戳），E2-F2 實作解析管線時再依需求演進（走 migration，不破壞性重建）。

## 12. 三層結構回溯 ✅

- Feature：**E1-F1**（E1 平台與信任基座）
- SDD：**§12 技術限制**（→04_TECHNICAL_SPEC）；憲法 §1（技術棧）、§2（命名）、§5（不越界）
- 前置依賴 Feature：**無**（E1-F1 為全案起點）；外部依賴 Supabase 東京 ✅、平台決策 ✅

## 13. DOD 適用性備註

06_DOR_DOD 追加三條中：「LLM Streaming」與「四層權限鏈」本 Sprint 不適用（無 LLM、無健康查詢）；「日誌掃描」適用——AC-4 要求 Worker 日誌不得含 payload 敏感內容，完整 redaction 基線在 Sprint 2。
