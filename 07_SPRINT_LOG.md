# Sprint Log — 個人健康檢查管理平台

> 目前狀態：Sprint 1 ✅ 完成（2026-07-12）。下一個：Sprint 2（E1-F1 後半，骨架收斂）DOR。

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
