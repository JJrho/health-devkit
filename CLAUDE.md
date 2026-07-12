# health-devkit — AI Agent 快速上手

個人健康檢查管理平台（MVP）。**開工前必讀**：11_AI_AGENT_INSTRUCTIONS.md 的必讀順序（02_CONSTITUTION 是最上位法）。目前進度見 10_SYNC.md 與 07_SPRINT_LOG.md。

## 硬規則（詳見憲法）
- 醫療安全（憲法 §3）優先於功能完成度；未確認資料不入正式分析
- 外部服務一律經 `src/adapters/` 介面；LLM 輸出只准 Streaming
- 日誌走 `src/lib/logger.ts` 白名單 redaction；健康內容／金鑰永不入日誌與對話
- 金鑰只存本機 `.env` 與 Zeabur 變數；`.env.example` 只放佔位符

## 開發指令
pnpm dev／worker／test／test:e2e／typecheck／lint／db:migrate／db:rollback（詳 00_README 開發指南）

## Zeabur Deployment
- Project ID: 6a531b1bb421dcaba7ae2578（health-devkit，Linode Tokyo 專屬伺服器 server-6a531632e33921bfb5d0fa55）
- Service ID (web): 6a532224b421dcaba7ae2880（GIT，main，自動偵測 Next.js）
- Service ID (worker): 6a532236b421dcaba7ae288a（GIT，main，啟動命令見 zbpack.worker.json）
- Git push 到 main 即自動重建重部署；回滾與事故處置見 docs/runbook.md
