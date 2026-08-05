# 個人健康檢查管理平台 — 專案開發包

> 遵循方法論：AI 敏捷開發流程 v1.2.0（獨立 repo，tag v1.2.0）
> 開發包狀態：**v1.0.0 RATIFIED（2026-07-11）**——Clarify 收斂、WBS 拆解完成，待 Sprint 1 DOR

## 這個專案是什麼
幫 50–65 歲使用者整理多年健檢資料、追蹤趨勢、建立可停止的健康行動計畫的平台。不診斷、不開藥、不用命理。一句話版見 03_SDD.md §1；白話版見上游規格 §32（archive/upstream_spec/個人健康檢查管理平台_規格_v1_0_0.md）。

## 目前進度與下一步
1. ✅ 上游規格 v1.2.2 與技術選型 v1.0.0 完成（archive/upstream_spec/，2026-07-17 補進 repo，詳見 KB-027）
2. ✅ 憲法草案、SDD 精煉版草案、Clarify 清單完成
3. ✅ Clarify C1–C22 決議（archive/previous_decisions/）
4. ✅ 粗估 17／精估 24；WBS 三層拆解＋三輪檢查通過（05_BACKLOG、13_ROADMAP）
5. ✅ **Sprint 1～24（E1–E6，全案 20 個原始 MVP Feature）全數完成，正式站部署驗證通過（2026-07-22，Sprint 24 結案）**——僅剩台灣個資與醫療法律審查（外部人工事項）為上線硬門檻，見 KNOWN_ISSUES.md
6. ✅ **Sprint 25（E7-F1：公開站五頁，MVP 上線後首次功能性追加）已完成並正式站部署驗證通過（2026-08-05）**——取代過渡版 Hero＋補齊 `/privacy`／`/scope`／`/about`／`/ai-principles` 四個上游 §6.1 公開頁面
7. 🔵 **← 現在：Sprint 26（og:image 補件＋E2-F5：原始掃描檔刪除引導提示）已完成本機實作與測試，待 PO 確認 commit／push**（DOR：sprints/sprint-26-dor.md）

## 接手必讀順序
02_CONSTITUTION → 03_SDD（含 §17 決議定案值）→ 05_BACKLOG → 13_ROADMAP → 06_DOR_DOD → 10_SYNC

## 開發指南（Sprint 1 起）

> ⚠️ 專案路徑必須是純英文（中文路徑會使 Node 崩潰，KB 記載）。目前位置：`C:\Users\jr_ho\Desktop\Medical-AI-Work\health-devkit`

1. **Clone**：`git clone https://github.com/JJrho/health-devkit.git`
2. **環境變數**：複製 `.env.example` 為 `.env`，填入 Supabase 四項值（取得位置見範本註解）。`.env` 不進版控。
3. **安裝**：`pnpm install`（Node ≥ 22、pnpm 11）
4. **資料庫**：`pnpm db:migrate`（套用 migration；回滾用 `pnpm db:rollback`）
5. **啟動**：`pnpm dev`（Web，http://localhost:3000）；`pnpm worker`（背景 Worker，另開終端）
6. **測試**：`pnpm test`（單元＋整合）；`pnpm test:e2e`（Playwright，首次先 `pnpm exec playwright install chromium`）；`pnpm typecheck`／`pnpm lint`

> ⚠️ 若曾跑過 `pnpm build`／`pnpm start`（例如重現正式環境行為做診斷），結束後**務必**清 `rm -rf .next` 並確認 3000 埠已釋放，否則切回 `pnpm dev`／`pnpm test:e2e` 可能出現假性 404 或逾時（KB-017）。

### 程式結構（C1：單一 app＋領域資料夾）
- `src/app/` — Next.js App Router（頁面與 API）
- `src/adapters/` — 外部服務介面群（憲法 §1）＋ `pg-queue/` 實作
- `src/db/` — Drizzle schema 與連線；migration 在 `drizzle/`（含 `down/` 回滾檔）
- `src/worker/` — 長駐背景 Worker（Zeabur 獨立 service）
- `src/lib/` — 共用基座（env、logger 白名單日誌）
- `tests/` — unit（Vitest）＋ e2e（Playwright）；`scripts/` — migrate/rollback
