# SYNC 交接文件

## 1. 專案目前狀態
開發包 v1.0.0 RATIFIED；三層結構已啟用（20 Feature／24 Sprint）；GitHub repo：JJrho/health-devkit（Private）。**Sprint 1～6 ✅（2026-07-12～07-16）＝E1-F1／E1-F2／E1-F4／E1-F5／E2-F1 Feature 結案（5/20）**：全數已 commit＋push＋正式站部署驗證通過（https://health-devkit.zeabur.app，Linode Tokyo 專屬伺服器**已升級 2C/4GB**；ID 見 CLAUDE.md）。**Sprint 7（E2-F2 文字型 PDF 解析管線，PoC 1/2）DOR 已通過（2026-07-16），待開工**。⚠️ 專案路徑：`C:\Users\jr_ho\Desktop\Medical-AI-Work\health-devkit`（KB-004）。外部依賴：Supabase 東京 ✅；Zeabur ✅ 已上線；Storage bucket ✅（Supabase Storage，A18）；Google OAuth（E1-F3 前）／LLM key（E4-F3 前）／首批知識來源（E4-F1 前）後補；**真實健檢報告 PDF 樣本（A24，Sprint 7 需要，PO 提供）**。

## 2. 目前版本
開發包 v1.0.0（RATIFIED 2026-07-11）；上游規格 v1.2.2；技術選型 v1.0.0；方法論 v1.2.0。

## 3. 最近完成
Sprint 6（E2-F1 上傳會話與預覽模組）：已 commit（`b2b413f`）＋push＋正式站部署驗證通過。⚠️ A21（惡意檔案掃描缺口）正式生效，登記 KB-021。

Sprint 7（E2-F2 文字型 PDF 解析管線）DOR 已於 2026-07-16 通過（A22–A25 追認，見 sprints/sprint-07-dor.md）：本案第一個 🔴 高風險 PoC Feature（2 Sprint，本輪為第 1 個）。安全前置決策 **KB-022**：與其提前補惡意檔案掃描（訊號比對式掃毒抓不到「檔案結構打解析器漏洞」這個更貼近的威脅），改為 Worker 解析工作本輪即加逐工作逾時（60 秒草案）；KB-021（AV 掃描）維持不變留 E6-F2。

**OCR 排程更新（2026-07-16，PO 拍板）**：討論樣本準備時 PO 指出拍照/掃描上傳（C4 目前排除的情境）評估為非小比例的真實使用情境。掃描 OCR 啟用（C4 flag）已移出 05_BACKLOG「Phase 2+」大雜燴，**暫定排在 E2-F3 之後**，確切 Sprint 待 Sprint 7／8（E2-F2 PoC）結果拍板——PoC 順利則可提早排入，PoC 暴露較多問題則優先把既有管線做穩。屆時另立 DOR，需先決定 OCR 供應商（自架 vs. 雲端 API，涉及成本與健檢文件送第三方的隱私考量）。

## 4. 下一步
Sprint 7 開工 → E2-F2 PoC 1/2 實作。需要 PO 提供樣本（A24）：真實或高擬真健檢報告 PDF（測準確率）＋拍照/掃描檔（測 AC-4 優雅失敗路徑）。Sprint 7/8 結果出爐後需回頭拍板 OCR 確切排程。KB-018／KB-020 待 PO 決定處理時機（非阻塞）。

## 5. 最高優先事項
Sprint 7（E2-F2 PoC，🔴 高風險：表格抽取準確率＋`pdfjs-dist` 伺服器端可行性 A22 雙重不確定性）；KB-018（RLS BYPASSRLS）與 KB-020（E1-F2 登入問題，C6 牴觸）待決定處理時機；高風險 PoC 依序：E2-F2（進行中）、E4-F3 引用驗證。

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
