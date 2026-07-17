# health-devkit — AI Agent 快速上手

個人健康檢查管理平台（MVP）。**開工前必讀**：11_AI_AGENT_INSTRUCTIONS.md 的必讀順序（02_CONSTITUTION 是最上位法）。目前進度見 10_SYNC.md 與 07_SPRINT_LOG.md。

## 硬規則（詳見憲法）
- 醫療安全（憲法 §3）優先於功能完成度；未確認資料不入正式分析
- 外部服務一律經 `src/adapters/` 介面；LLM 輸出只准 Streaming
- 日誌走 `src/lib/logger.ts` 白名單 redaction；健康內容／金鑰永不入日誌與對話
- 金鑰只存本機 `.env` 與 Zeabur 變數；`.env.example` 只放佔位符
- **絕不對含機密的檔案（`.env` 等）使用 Read 或任何會印出完整內容的工具／指令**。一律用腳本讀值進變數、只回報布林/長度/結構是否正確。Sprint 3 曾因違反此規則三度洩漏機密（Sprint 8 再犯第 4 次），教訓見 KB-009~017、KB-025、KB-026、07_SPRINT_LOG
- **`zeabur variable create／update／delete` 一律禁止直接查看標準輸出**——這些指令執行成功後會主動印出該 service「整個現有變數表」（不只 `zeabur variable list` 會，這三個也會，KB-026 實測證實）。一律先把整個輸出重導向到檔案，再用 `grep -c` 之類只回傳數字的方式確認成功，讀完立刻刪除該檔案；不得用 `grep -v` 等「過濾掉我預期會出現的值」的方式防禦，因為會漏掉非預期的既有機密
- PowerShell 讀 `.env`（含 CJK 註解）務必加 `-Encoding UTF8`，否則會誤判特定行不存在（KB-015）
- `zeabur service exec` 無法傳遞帶減號旗標給容器內指令（`sh -c`／`--eval` 皆會報錯）；要在容器內跑診斷，改執行專案內既有、不需旗標的腳本（KB-016）

## Zeabur 維運鐵則（Sprint 3 教訓，KB-013/014）
- 輪替密碼／金鑰時**一次到位**：同步更新所有會連線的 service（web＋worker）再重啟，不要分批多次改——分批會讓舊 pod 用舊密碼連線失敗累積，觸發 Supabase pooler 斷路器（`ECIRCUITBREAKER`），之後即使密碼正確、新連線仍會被暫時封鎖，症狀與密碼錯誤完全相同
- **一次只重啟一個 service**，確認 `/api/health` 200 穩定後再動下一個，避免同時重啟造成記憶體瞬間翻倍、觸發 MemoryPressure 逐出
- 診斷連線問題找不到頭緒時，用 `zeabur service exec --id <id> -- pnpm exec tsx scripts/verify-db.ts` 直接在容器內看完整錯誤訊息（該腳本不印機密）
- **部署驗證不能只看 `deployment list` 轉 `RUNNING` 或 `/api/health` 200 就結案**（KB-025）——這只證明服務有啟動，不證明功能正常（曾發生 worker 因缺環境變數導致所有工作皆失敗，但服務本身照常 `RUNNING`）。有實際工作管線時，應跑一次真實資料的端到端功能驗證才算數

## 開發指令
pnpm dev／worker／test／test:e2e／typecheck／lint／db:migrate／db:rollback（詳 00_README 開發指南）

## Zeabur Deployment
- Project ID: 6a531b1bb421dcaba7ae2578（health-devkit，Linode Tokyo 專屬伺服器 server-6a531632e33921bfb5d0fa55，**2C/4GB**，2026-07-15 由 1C/2GB 升級）
- Service ID (web): 6a532224b421dcaba7ae2880（GIT，main，自動偵測 Next.js）
- Service ID (worker): 6a532236b421dcaba7ae288a（GIT，main，啟動命令見 zbpack.worker.json）
- Git push 到 main 即自動重建重部署；回滾與事故處置見 docs/runbook.md
- 需要 `NEXT_PUBLIC_SUPABASE_URL`／`NEXT_PUBLIC_SUPABASE_ANON_KEY`（瀏覽器端密碼重設用，KB-012；值與伺服器端版本相同，非機密）
