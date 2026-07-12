# Runbook — 個人健康檢查管理平台

> Sprint 2 起頭版；隨各 Feature 上線增補。讀者：PO 與接手的 AI Agent。

## 1. 部署

- **平台**：Zeabur（Tokyo）。同一專案兩個 service，來源同一 GitHub repo（JJrho/health-devkit，main 分支）：
  - `web`：Next.js（Zeabur 自動偵測建置）
  - `worker`：長駐佇列 Worker（`zbpack.worker.json` 指定 `pnpm worker` 啟動）
- **觸發**：push 到 main 自動重建重部署。CI（GitHub Actions）綠勾後才可合入／推送。
- **驗證部署成功**：
  1. `https://<web 網域>/api/health` 回 200＋`{"status":"ok"}`
  2. Zeabur worker 日誌出現 `{"message":"Worker 啟動"}`
  3. 本地 `pnpm exec tsx scripts/poc-queue-demo.ts`（連同一 DB）→ RESULT 行 echo=completed

## 2. 回滾

- **程式回滾**：Zeabur 服務頁 → Deployments → 選前一個成功版本 Redeploy；或 `git revert <壞 commit>` 後 push（偏好後者，保持 git 與線上一致）。
- **資料庫回滾**：`pnpm db:rollback`（回滾最後一個 migration；機制見 scripts/rollback.ts）。⚠️ 破壞性操作——回滾會 DROP 對應表；正式資料出現後，回滾前必須先確認備份（Supabase 每日備份＋PITR 依方案）。
- **原則**：程式與 migration 一起回滾時，先程式後資料庫。

## 3. 環境變數與金鑰輪替

- **清單**：見 `.env.example`。真實值僅存在：PO 本機 `.env`＋Zeabur 服務變數。**永不**進 git、日誌、對話。
- **輪替步驟**（任一金鑰疑似外洩即執行）：
  1. Supabase：Settings → API keys → 重新產生 secret key；Settings → Database → 重設 DB 密碼
  2. 更新 PO 本機 `.env`
  3. 更新 Zeabur `web`／`worker` 兩個 service 的對應變數 → 重啟服務
  4. 驗證：`/api/health` 200＋worker 日誌無連線錯誤
- **憲法 §4 提醒**：日誌採白名單 redaction（src/lib/logger.ts）；發現日誌出現非白名單內容＝P0 事故。

## 4. 事故基本處置

| 症狀 | 第一步 | 常見原因 |
|---|---|---|
| 首頁／health 5xx | Zeabur web 日誌 | 建置失敗、env 缺漏（env.ts 會噴「缺少環境變數 X」） |
| Worker 不消化工作 | Zeabur worker 日誌找「輪詢例外」 | DB 連線（DATABASE_URL／pooler）、queue_jobs 表被回滾 |
| DB 連不上 | Supabase Dashboard 專案狀態 | 免費方案 pause、密碼輪替後未同步 |
| 部署卡住 | Zeabur build log | pnpm install 失敗（lockfile 不一致）、Node 版本 |
- **升級原則**：影響健康資料正確性或外洩疑慮 → 立即停 service（Zeabur pause），先保全後修復；其餘先開 issue 記錄再修。
- **事後**：事故寫入 09_KNOWLEDGE_BASE（KB 編號），修法走規格（憲法 §5 鐵則）。
