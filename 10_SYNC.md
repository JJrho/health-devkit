# SYNC 交接文件

## 1. 專案目前狀態
開發包 v1.0.0 RATIFIED；三層結構已啟用（20 Feature／24 Sprint）；GitHub repo：JJrho/health-devkit（Private）。**Sprint 1～4 ✅（2026-07-12～07-15）＝E1-F1／E1-F2／E1-F4 Feature 結案（3/20）**：已 commit＋push＋正式站部署驗證通過（https://health-devkit.zeabur.app，Linode Tokyo 專屬伺服器**已升級 2C/4GB**；ID 見 CLAUDE.md）。**Sprint 5（E1-F5 個人健康背景模組）實作完成、本機驗證通過（2026-07-15，E1 全數結案 4/5），尚未部署正式站**。⚠️ 專案路徑：`C:\Users\jr_ho\Desktop\Medical-AI-Work\health-devkit`（KB-004）。外部依賴：Supabase 東京 ✅；Zeabur ✅ 已上線；Google OAuth（E1-F3 前）／LLM key（E4-F3 前）／首批知識來源（E4-F1 前）後補。

## 2. 目前版本
開發包 v1.0.0（RATIFIED 2026-07-11）；上游規格 v1.2.2；技術選型 v1.0.0；方法論 v1.2.0。

## 3. 最近完成
Sprint 5（E1-F5 個人健康背景模組）：`health_profiles` jsonb（承接上游 §11.1／§12.2 共 20 欄位）＋`GET`/`PUT` autosave＋OCC＋四層鏈第 3 層「資源屬於專案」首次真正落地並驗證（同一使用者兩專案背景互相隔離）；真實瀏覽器驗證 autosave／續編／跨帳號 403＋稽核 log 不含健康內容；41 個測試＋typecheck／lint／`pnpm build` 全綠。尚未 commit／push／部署。過程修正測試基礎設施回歸（KB-019 更新）。

Sprint 4（E1-F4 健康專案模組）：已 commit（`1d4da9e`）＋push＋正式站部署驗證通過。實作中發現兩項待處理事項（見 09_KNOWLEDGE_BASE KB-018/020）：RLS 政策因連線角色 BYPASSRLS 尚未實際生效；E1-F2 遺留的未驗證帳號登入問題。PO 2026-07-15 決定兩者皆暫緩、先記錄為已知限制。

## 4. 下一步
PO 審閱 Sprint 5 產出 → 決定 commit／push／正式站部署時機。KB-018／KB-020 待 PO 決定處理時機（非阻塞）。E1 全數完成後可規劃轉往 E2（健檢資料入庫管線）或補做 E1-F3（Google 登入）。

## 5. 最高優先事項
Sprint 5 成果待 PO 審閱與部署；KB-018（RLS BYPASSRLS）與 KB-020（E1-F2 登入問題，C6 牴觸）待決定處理時機；高風險 PoC 依序：E2-F2 解析管線、E4-F3 引用驗證。

## 6. 不可破壞的原則
憲法 §3 醫療安全全列；未確認資料不入正式分析；健康內容不入日誌（白名單 redaction 已落地）。**機密處理鐵則（本輪新增）：絕不對含機密的檔案／指令輸出使用會印出完整內容的工具，一律用腳本檢查布林/長度/結構。**

## 7. 已知 Bug
1. **RLS 政策未實際生效**（KB-018）：`projects` 表 RLS 政策已建立，但連線角色 `postgres` 具 `rolbypassrls=true`，政策對 app 自身連線不生效；真正防線為應用層四層鏈（已驗證有效）。修法需另建專用角色＋Zeabur 雙 service 環境變數同步更新，待 PO 確認後處理。
2. **未驗證帳號無法登入**（與 C6 牴觸）：全新註冊、未點驗證信的帳號走真實 Supabase 登入一律回 `email_not_confirmed`。Sprint 3 的單元測試因用 FakeAuthAdapter 未曾發現。**PO 2026-07-15 決定：本輪不修，先記錄為已知限制**——修法需關閉 Supabase「Confirm email」，但這可能讓所有新帳號被視為即時已驗證，使 C6「上傳／AI 鎖定至驗證完成」規則永遠不觸發；需先確認 Supabase 實際行為並設計對應方案（見 KB-020）再動手，非單純切一個開關。

已解決：Zeabur 伺服器記憶體吃緊（已升級 2C/4GB，KB-013）；Supabase pooler 斷路器（等待冷卻後恢復，KB-014）。

## 8. 重要技術決策
見 04 §1 決策摘要與 KB-003。

## 9. 接手前必讀
00_README → 02_CONSTITUTION → 03_SDD → 05_BACKLOG → 13_ROADMAP → 06_DOR_DOD → 09_KNOWLEDGE_BASE
- 13_ROADMAP.md（若已啟用三層結構）

## 10. 給下一位 AI 的提醒
本案是醫療相關產品：安全規則的優先級高於功能完成度；拿捏不準時，寧可保守並登記 A 編號假設等 PO 追認。
