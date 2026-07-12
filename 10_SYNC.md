# SYNC 交接文件

## 1. 專案目前狀態
開發包 v1.0.0 RATIFIED；三層結構已啟用（20 Feature／24 Sprint）；GitHub repo：JJrho/health-devkit（Private）。**Sprint 1＋2 ✅（2026-07-12）＝E1-F1 Feature 結案（1/20）**：技術棧驗證＋CI＋Zeabur 雙 service 上線（https://health-devkit.zeabur.app，Linode Tokyo 專屬伺服器；ID 見 CLAUDE.md）。⚠️ 專案路徑：`C:\Users\jr_ho\Desktop\Medical-AI-Work\health-devkit`（KB-004）。外部依賴：Supabase 東京 ✅；Zeabur ✅ 已上線；Google OAuth（E1-F3 前）／LLM key（E4-F3 前）／首批知識來源（E4-F1 前）後補。

## 2. 目前版本
開發包 v1.0.0（RATIFIED 2026-07-11）；上游規格 v1.2.2；技術選型 v1.0.0；方法論 v1.2.0。

## 3. 最近完成
Sprint 2（E1-F1 後半）：CI 綠＋Zeabur web/worker 上線＋/api/health＋error envelope/request_id＋OpenAPI 3.1 起頭＋logger redaction＋runbook，AC-1～6 全過（含雲端實測）。

## 4. 下一步
Sprint 3（E1-F2 帳號生命週期）DOR：Email 註冊/驗證/登入/忘記密碼/session/鎖定（C6–C9、C11 條款同意）；AuthAdapter 之 Supabase 實作。

## 5. 最高優先事項
E1-F2 → E1-F4（四層權限鏈，安全基線 🔴）；高風險 PoC 依序：E2-F2 解析管線、E4-F3 引用驗證。

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
