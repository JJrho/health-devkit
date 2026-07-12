# Sprint Log — 個人健康檢查管理平台

> 目前狀態：Sprint 3 進行中（E1-F2 帳號生命週期；DOR ✅ 2026-07-12，A7–A10 追認）。

## Sprint 3 — E1-F2：帳號生命週期模組 🔵

- 期間：2026-07-12 開工
- DOR：✅ 通過（sprints/sprint-03-dor.md；A7–A10 由 PO 追認）
- 目標：Email 註冊/驗證/登入/忘記密碼/session/鎖定（C6–C9、C11）＋公開站 auth UI
- 驗收：AC-1～AC-8（見 DOR §6）
- 狀態：🔵 進行中

## Sprint 2 — E1-F1 後半：骨架收斂 ✅

- 期間：2026-07-12（單日完成）
- DOR：✅ 通過（sprints/sprint-02-dor.md；A4–A6 由 PO 追認）
- 目標：CI＋Zeabur 雙 service 部署＋API 基座＋日誌 redaction 基線＋runbook → **達成，E1-F1 Feature 結案**

### 驗收結果（AC-1～AC-6 全數通過）
| AC | 結果 |
|---|---|
| AC-1 | ✅ GitHub Actions 綠勾（lint/typecheck/test，39 秒；A4：CI 不連 DB，整合測試自動跳過） |
| AC-2 | ✅ https://health-devkit.zeabur.app 首頁與 /api/health 皆 200（公開網址實測） |
| AC-3 | ✅ 本地 enqueue → **雲端** Worker 秒級撿起：echo completed、fail 重試 2/2 → failed；Zeabur 日誌僅白名單欄位 |
| AC-4 | ✅ /api/health 200＋request_id（body 與 x-request-id header 一致）；未定義端點回統一 error envelope（雲端實測） |
| AC-5 | ✅ redaction 測試：非白名單欄位剔除＋redactedFieldCount 標記、原始輸出無敏感值；requestId 貫穿 Web 與 Worker 雲端日誌 |
| AC-6 | ✅ runbook 四節（docs/runbook.md）；OpenAPI 3.1 格式驗證測試通過（openapi/openapi.json） |

### DOD 核對
- [x] 正常／邊緣／錯誤／回歸測試通過（Vitest 12/12、Playwright 3/3、CI 綠）
- [x] 肉眼驗收：公開網址可開
- [x] 部署基礎設施：Zeabur 專案 6a531b1bb421dcaba7ae2578（Linode Tokyo 專屬伺服器）；service ID 記於 CLAUDE.md；push-to-deploy 已驗證
- [x] 修正皆反映於規格與文件；SDD §15／ROADMAP／SYNC／KB 已更新
- [x] 假設 A4–A6 已於 DOR 追認；本輪無新增 A 編號
- [x] 追加 DOD：日誌掃描 ✅（redaction 基線＋雲端日誌實測）；LLM Streaming／權限鏈 N/A
- [x] 下一步明確：Sprint 3（E1-F2）DOR

### 本輪事件與教訓
1. Zeabur 的 GitHub App 授權與 Supabase 的 GitHub 整合是兩回事，需分別授權（PO 已加 health-devkit）
2. 部署目標拍板：現有 Linode Tokyo 專屬伺服器（1C/2GB，與 Supabase 同城，不額外花錢）；資源吃緊時再升級
3. Zeabur 機密設定流程確立：值由腳本從本機 .env 直送 CLI、輸出遮蔽，不經對話（A6 落地）
4. tsx 移入 dependencies（Worker 生產執行期需要）

## Sprint 1 — E1-F1 前半：技術棧 PoC 驗證線 ✅

- 期間：2026-07-12（單日完成）
- DOR：✅ 通過（sprints/sprint-01-dor.md；A1–A3 由 PO 追認）
- 目標：Next.js＋TS＋Drizzle＋Supabase 東京 PG（pgvector）＋PG queue Worker＋測試框架端到端跑通 → **達成，「首用技術棧」🔴 風險解除**

### 驗收結果（AC-1～AC-6 全數通過）
| AC | 結果 |
|---|---|
| AC-1 | ✅ migrate→pgvector／queue_jobs 出現；rollback→兩者消失；重 migrate→復原（Supabase 東京實庫實測） |
| AC-2 | ✅ Playwright：首頁 200、渲染、無 console error |
| AC-3 | ✅ 真實 Worker 秒級撿起 poc-echo 並 completed |
| AC-4 | ✅ poc-fail 重試 2/2 後標 failed；Worker 遇 DB 暫時例外自癒續行；日誌僅白名單欄位、payload 不落地 |
| AC-5 | ✅ Vitest 7/7（含佇列整合 4 項連實庫）；Playwright 1/1 |
| AC-6 | ✅ typecheck＋lint 0 錯；adapter 層外禁 vendor SDK 由 ESLint 規則把關 |

### DOD 核對
- [x] 正常路徑／邊緣（空佇列、重試邊界）／錯誤狀態（失敗鏈、Worker 自癒）測試通過
- [x] 回歸：修正測試隔離 bug 後全套重跑全綠
- [x] 肉眼驗收：首頁可開；README 五步指南可循
- [x] 無新增 UI/UX 問題（本輪僅佔位頁）
- [x] 修正皆反映於規格與 KB（測試隔離修法記 KB-007，無規格外手補）
- [x] Analyze 品質盤點：TS strict＋noUncheckedIndexedAccess；憲法 §1（Adapter 邊界）／§2（命名）／§4（白名單日誌）落地檢查通過
- [x] SDD §15／SPRINT_LOG／KNOWLEDGE_BASE（KB-004～007）／ROADMAP 已更新
- [x] 假設 A1–A3 已於 DOR 追認；本輪無新增 A 編號
- [x] 追加 DOD：LLM Streaming N/A（無 LLM；LlmAdapter 介面已強制僅串流）；四層權限鏈 N/A（無健康查詢）；日誌掃描 ✅（Worker 白名單日誌實測）
- [x] 下一步明確：Sprint 2 DOR

### 本輪事件與教訓
1. 專案自中文路徑搬遷至 `Medical-AI-Work\health-devkit`（Node CJK 崩潰，KB-004）；GitHub／Supabase 整合不受影響
2. PO 金鑰誤填 `.env.example`，commit 前攔下還原；已建議輪替 secret key（KB-006）
3. 佇列整合測試隔離 bug 一枚，當輪修復（KB-007）
4. Worker 啟動初期一次暫時性 DatabaseError，自癒機制正常（觀察項，Sprint 2 部署後留意）
