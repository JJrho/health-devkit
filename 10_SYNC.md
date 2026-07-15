# SYNC 交接文件

## 1. 專案目前狀態
開發包 v1.0.0 RATIFIED；三層結構已啟用（20 Feature／24 Sprint）；GitHub repo：JJrho/health-devkit（Private）。**Sprint 1～3 ✅（2026-07-12～07-15）＝E1-F1＋E1-F2 Feature 結案（2/20）**：技術棧驗證＋CI＋Zeabur 雙 service 上線＋帳號生命週期全數上線並經 PO 正式站完整驗收（https://health-devkit.zeabur.app，Linode Tokyo 專屬伺服器**已升級 2C/4GB**；ID 見 CLAUDE.md）。⚠️ 專案路徑：`C:\Users\jr_ho\Desktop\Medical-AI-Work\health-devkit`（KB-004）。外部依賴：Supabase 東京 ✅；Zeabur ✅ 已上線；Google OAuth（E1-F3 前）／LLM key（E4-F3 前）／首批知識來源（E4-F1 前）後補。

## 2. 目前版本
開發包 v1.0.0（RATIFIED 2026-07-11）；上游規格 v1.2.2；技術選型 v1.0.0；方法論 v1.2.0。

## 3. 最近完成
Sprint 3（E1-F2 帳號生命週期）：註冊/登入/忘記密碼/session/鎖定全數上線，AC-1～8 全過，PO 正式站親自完整驗收（含密碼重設全流程）。過程排除多起事故（KB-009~014，見 07_SPRINT_LOG 詳述）：GoTrue Admin API 相容性、API 錯誤防護、Email 限流、密碼重設架構整個重寫（免費方案樣板鎖死）、伺服器記憶體吃緊、Supabase pooler 斷路器。

## 4. 下一步
Sprint 4（E1-F4 健康專案模組與四層權限鏈）DOR：CRUD＋RLS，本案安全基線 🔴。

## 5. 最高優先事項
E1-F4（四層權限鏈，安全基線 🔴）；高風險 PoC 依序：E2-F2 解析管線、E4-F3 引用驗證。

## 6. 不可破壞的原則
憲法 §3 醫療安全全列；未確認資料不入正式分析；健康內容不入日誌（白名單 redaction 已落地）。**機密處理鐵則（本輪新增）：絕不對含機密的檔案／指令輸出使用會印出完整內容的工具，一律用腳本檢查布林/長度/結構。**

## 7. 已知 Bug
無。已解決：Zeabur 伺服器記憶體吃緊（已升級 2C/4GB，KB-013）；Supabase pooler 斷路器（等待冷卻後恢復，KB-014）。

## 8. 重要技術決策
見 04 §1 決策摘要與 KB-003。

## 9. 接手前必讀
00_README → 02_CONSTITUTION → 03_SDD → 05_BACKLOG → 13_ROADMAP → 06_DOR_DOD → 09_KNOWLEDGE_BASE
- 13_ROADMAP.md（若已啟用三層結構）

## 10. 給下一位 AI 的提醒
本案是醫療相關產品：安全規則的優先級高於功能完成度；拿捏不準時，寧可保守並登記 A 編號假設等 PO 追認。
