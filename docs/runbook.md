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
- **資料庫回滾**：`pnpm db:rollback`（回滾最後一個 migration；機制見 scripts/rollback.ts）。⚠️ 破壞性操作——回滾會 DROP 對應表。**⚠️ E6-F2 查證更正（2026-07-22）：本專案 Supabase 為免費方案，免費方案完全沒有自動每日備份、也不提供 PITR（皆為付費方案專屬，見 KNOWN_ISSUES.md）**——回滾前沒有平台層級安全網可用，務必先手動 `supabase db dump` 或等價方式匯出，且應優先評估「新增修正 migration」取代「回滾」，非必要不回滾正式站。
- **原則**：程式與 migration 一起回滾時，先程式後資料庫。

## 3. 環境變數與金鑰輪替

- **清單**：見 `.env.example`。真實值僅存在：PO 本機 `.env`＋Zeabur 服務變數。**永不**進 git、日誌、對話。
- **輪替步驟**（任一金鑰疑似外洩即執行；Sprint 3 KB-013/014 教訓，務必依序）：
  1. Supabase：Settings → API keys → 重新產生 secret key；Settings → Database → 重設 DB 密碼
  2. 更新 PO 本機 `.env`（檢查用腳本，`Get-Content -Encoding UTF8`，勿印出內容）
  3. **一次性**更新 Zeabur `web`**與**`worker`兩個 service 的對應變數（`variable update`，輸出只檢查是否含 "Successfully"，不印表格）——不要分批只改一個就重啟，舊 pod 用舊密碼連線失敗會累積觸發 Supabase pooler 斷路器（`ECIRCUITBREAKER`），之後即使密碼正確、新連線仍暫時被封鎖，症狀與密碼錯誤無法分辨
  4. **依序**重啟：先 `web`，等 `/api/health` 200 穩定後才重啟 `worker`（勿同時重啟，避免記憶體瞬間翻倍觸發 MemoryPressure 逐出）
  5. 驗證：`/api/health` 200＋`pnpm exec tsx scripts/verify-db.ts`（本機＋`zeabur service exec` 容器內皆跑一次）＋worker 日誌無連線錯誤
  6. 若驗證仍顯示連線失敗但密碼確認無誤，優先懷疑斷路器：`zeabur service exec --id <id> -- pnpm exec tsx scripts/verify-db.ts` 直接看完整錯誤訊息（會明確顯示 `ECIRCUITBREAKER` 字樣），靜待冷卻（約 10-15 分鐘）後重測，不要頻繁重試（每次失敗連線都可能延長封鎖）
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
