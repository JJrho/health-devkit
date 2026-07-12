# Sprint 2 DOR — E1-F1 後半：骨架收斂（CI＋部署＋API 基座）

> 狀態：**✅ 通過（PO 2026-07-12：A4–A6 追認、DOR 通過）**
> 對應：E1-F1「技術棧 PoC 與專案骨架」後半（05_BACKLOG E1 表）；SDD §10／§11／§12；憲法 §1／§4
> 前一 Sprint：Sprint 1 ✅（技術棧 PoC 全過，07_SPRINT_LOG）

---

## 1. 需求描述 ✅

把 Sprint 1 驗證過的技術線收斂成「可持續開發、可部署」的骨架。五項交付：

1. **CI（GitHub Actions）**：push／PR 到 main 自動跑 lint＋typecheck＋單元測試（不連 DB，見 A4）；pnpm 快取；Node 22。
2. **Zeabur 部署（Tokyo）**：同一專案開兩個 service——`web`（Next.js）與 `worker`（長駐佇列 Worker）；環境變數於 Zeabur 後台設定（值由 PO 持有）；web 用預設 `*.zeabur.app` 網域（正式網域延後，A5）。
3. **API 基座**：`/api/health` 健康檢查端點；統一 **error envelope**（SDD §10：`{ error: { code, message }, request_id }`）與 **request_id**（每請求產生、回應帶回、入日誌）；**OpenAPI 3.1** 規格檔起頭（先涵蓋 health 端點，業務端點隨各 Feature 增補）。
4. **日誌 redaction 基線**：logger 由「白名單欄位」升級為「白名單＋執行期 redaction 防線」——非白名單欄位一律剔除並標記；request_id 貫穿 Web 與 Worker 日誌（憲法 §4）。
5. **Runbook 起頭**（`docs/runbook.md`）：部署／回滾／env 輪替／事故基本處置四節。

## 2. 使用者角色 ✅

無終端使用者功能。角色＝開發者（AI Agent）與 PO（驗收者＋Zeabur 帳號持有人）。

## 3. 操作流程 ✅

- CI：`git push` → GitHub Actions 自動執行 → 綠勾。
- 部署：Zeabur 連 GitHub repo → push 觸發建置 → web／worker 兩 service 上線。
- 驗收：開公開網址看首頁；本地 enqueue 測試工作 → Zeabur 上的 Worker 撿走處理。

## 4. 輸入資料 ✅

| 輸入 | 來源 | 狀態 |
|---|---|---|
| GitHub repo＋Sprint 1 骨架 | 已就緒 | ✅ |
| Zeabur 帳號（Tokyo region） | PO 已有；CLI／外掛已裝 | ✅（部署時需 PO 授權登入） |
| Supabase 連線資訊 | PO 的 .env；部署時由 PO 填入 Zeabur 變數（或授權我經 CLI 設定） | ✅ |

## 5. 輸出結果 ✅

§1 五項交付物；外加公開可訪問的 web 網址與運行中的 worker service。

## 6. 驗收條件（Given／When／Then）✅

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | push 任意 commit 至 main | GitHub Actions 觸發 | lint＋typecheck＋單元測試全綠；pnpm 快取生效 |
| AC-2 | Zeabur 兩 service 部署完成 | 開啟 web 公開網址 | 首頁 HTTP 200 正常渲染 |
| AC-3 | Zeabur worker 運行中 | 本地對同一 DB enqueue `poc-echo` | 雲端 Worker 於 30 秒內撿起並標記 completed；Zeabur 日誌僅白名單欄位 |
| AC-4 | web 運行中 | GET `/api/health` | 200＋`{ status: "ok" }`＋回應含 request_id；故意打不存在端點回統一 error envelope |
| AC-5 | 任意程式呼叫 logger 傳入非白名單欄位 | 執行 redaction 單元測試 | 非白名單欄位被剔除且輸出含 redaction 標記；request_id 出現在 Web 與 Worker 日誌 |
| AC-6 | repo 根目錄 | 檢視 `docs/runbook.md`＋OpenAPI 規格檔 | runbook 四節齊備；OpenAPI 3.1 檔案通過格式驗證且涵蓋 `/api/health` |

## 7. Clarify 釐清 ✅

C1／C2／C5 沿用；無新增未決 Clarify。

## 8. 可能影響的舊功能 ✅

Sprint 1 全部交付物（migration、queue、測試）不得回歸——AC-1 的 CI 即為回歸防線；logger 介面擴充需保持既有呼叫點相容（Worker 白名單日誌）。

## 9. 一個 Sprint 內可完成 ✅

五項皆為設定與基座級，無業務邏輯；E1-F1 精估 2 Sprint 的後半。

## 10. 範圍排除 ✅

- 正式網域購買／綁定（用 `*.zeabur.app` 預設）
- 監控告警、APM、uptime 檢查（E6-F2 交付驗證包再議）
- 業務 API 端點與其 OpenAPI 條目（隨 E1-F2 起各 Feature 增補）
- CI 跑 DB 整合測試與 e2e（A4；本地與 release 前執行）
- 帳號模組（E1-F2）、Storage bucket（E2-F1）、Redis、掃描 OCR

## 11. 假設登記（待 PO 於 DOR 核對時追認）

- **A4**：CI **不連正式 DB**——佇列整合測試標記為需 `DATABASE_URL`，CI 環境不給、自動跳過；整合驗證在本地與 release 前跑。理由：CI 打正式 Supabase 有資料與金鑰暴露風險；測試專用 DB 延後到有需要時再議。
- **A5**：web 先用 Zeabur 預設 `*.zeabur.app` 網域；正式網域與 HTTPS 客製延後（不影響 E1-F2 開發）。
- **A6**：Zeabur 環境變數的機密值由 **PO 於後台親自填入**（或現場授權我以 CLI 代設）；任何情況金鑰不經對話明文。

## 12. 三層結構回溯 ✅

- Feature：**E1-F1 後半**（完成本 Sprint 即 E1-F1 整體 ✅，Feature 1/20）
- SDD：§10（錯誤處理）、§11（可維護性）、§12（技術限制）；憲法 §1（OpenAPI 3.1）、§4（日誌）
- 前置依賴：Sprint 1 ✅；外部依賴 Zeabur 帳號 ✅

## 13. DOD 適用性備註

追加三條中：「LLM Streaming」「四層權限鏈」仍 N/A；「日誌掃描」**本 Sprint 為主戰場**（redaction 基線＋雲端日誌實測即其落地）。
