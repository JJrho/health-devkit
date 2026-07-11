# SYNC 交接文件

## 1. 專案目前狀態
開發包 v1.0.0 RATIFIED；三層結構已啟用（20 Feature／24 Sprint）；GitHub repo：JJrho/health-devkit（Private）。**Sprint 1 ✅ 完成（2026-07-12）**：技術棧 PoC 全線驗證通過（詳 07_SPRINT_LOG）。⚠️ 專案已搬遷至 `C:\Users\jr_ho\Desktop\Medical-AI-Work\health-devkit`（KB-004，中文路徑不可用）。外部依賴：Supabase 東京 ✅（.env 已可連線）；Zeabur Tokyo 已拍板 ✅；Google OAuth／LLM key／首批知識來源依 Sprint 順序後補。

## 2. 目前版本
開發包 v1.0.0（RATIFIED 2026-07-11）；上游規格 v1.2.2；技術選型 v1.0.0；方法論 v1.2.0。

## 3. 最近完成
Sprint 1（E1-F1 前半）：Next.js＋Drizzle＋pgvector migration（可回滾）＋五 Adapter 介面＋PG Queue／Worker＋Vitest／Playwright，AC-1～6 全過。

## 4. 下一步
Sprint 2（E1-F1 後半）DOR：CI（GitHub Actions）＋Zeabur Web/Worker 兩 service 部署＋OpenAPI 3.1 基座＋error envelope/request_id＋結構化日誌 redaction 基線＋runbook 起頭。OAuth／LLM key／知識來源到對應 Feature 再備。

## 5. 最高優先事項
Sprint 2 骨架收斂；高風險 PoC 依序：E2-F2 解析管線（第 6–7 輪）、E4-F3 引用驗證。

## 6. 不可破壞的原則
憲法 §3 醫療安全全列；未確認資料不入正式分析；健康內容不入日誌（Worker 白名單日誌已落地，KB 見 07 記錄）。

## 7. 已知 Bug
無。觀察項：Worker 啟動初期偶發暫時性 DatabaseError（自癒正常，Sprint 2 部署後留意）。

## 8. 重要技術決策
見 04 §1 決策摘要與 KB-003。

## 9. 接手前必讀
00_README → 02_CONSTITUTION → 03_SDD → 05_BACKLOG → 13_ROADMAP → 06_DOR_DOD → 09_KNOWLEDGE_BASE
- 13_ROADMAP.md（若已啟用三層結構）

## 10. 給下一位 AI 的提醒
本案是醫療相關產品：安全規則的優先級高於功能完成度；拿捏不準時，寧可保守並登記 A 編號假設等 PO 追認。
