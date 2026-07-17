# SYNC 交接文件

## 1. 專案目前狀態
開發包 v1.0.0 RATIFIED；三層結構已啟用（20 Feature／24 Sprint）；GitHub repo：JJrho/health-devkit（Private）。**Sprint 1～6 ✅（2026-07-12～07-16）＝E1-F1／E1-F2／E1-F4／E1-F5／E2-F1 Feature 結案（5/20）**：全數已 commit＋push＋正式站部署驗證通過（https://health-devkit.zeabur.app，Linode Tokyo 專屬伺服器**已升級 2C/4GB**；ID 見 CLAUDE.md）。**Sprint 7（E2-F2 文字型 PDF 解析管線 PoC 1/2）機制實作完成、以 7 份 PO 真實健檢報告完整驗證，已 commit＋push（2026-07-16），尚未部署正式站**。**KB-023：7 份真實樣本僅 14% 有文字層，86% 進不了本管線；PO 拍板 OCR 排程維持原計畫、排在 E2-F3 之後不提前**。⚠️ 專案路徑：`C:\Users\jr_ho\Desktop\Medical-AI-Work\health-devkit`（KB-004）。外部依賴：Supabase 東京 ✅；Zeabur ✅ 已上線；Storage bucket ✅（Supabase Storage，A18）；Google OAuth（E1-F3 前）／LLM key（E4-F3 前）／首批知識來源（E4-F1 前）後補。

## 2. 目前版本
開發包 v1.0.0（RATIFIED 2026-07-11）；上游規格 v1.2.2；技術選型 v1.0.0；方法論 v1.2.0。

## 3. 最近完成
Sprint 7（E2-F2 文字型 PDF 解析管線 PoC 1/2）：A22（`pdfjs-dist` 伺服器端文字＋座標抽取）驗證可行，本輪最大技術不確定性已排除。`extracted_items` 表＋自動觸發＋PoC 啟發式解析（A23）＋KB-022 逾時防線（60 秒）＋四層鏈重用＋唯讀結果 UI 皆已完成。69 個測試＋typecheck／lint／`pnpm build` 全綠。過程修正測試基礎設施更根本的問題（KB-019 最終更新：四個共用網域測試檔的清理查詢未吃到各自前綴，平行執行互刪；改用共用 `cleanupTestData` 批次刪除 helper，同時解決正確性與效能）。

**真實 PoC 結果（KB-023，本輪最重要產出）**：PO 提供 7 份 2020～2025 年真實健檢報告 PDF（本人＋一位家屬），全數跑過真實 Worker 進程。**僅 1 份（14%）有文字層**能進到解析邏輯，其餘 6 份（86%）`pdfjs-dist` 回傳零文字項目、直接 `processing_failed`。唯一成功的 1 份正確抽出多筆真實數值，但也暴露具體缺陷（多欄表格參考區間污染、單位常抓不到、頁首資訊誤判）。**PO 說明真實成因**：台灣醫療院所預設寄紙本，僅私人健檢中心於病患提供 Email 時才寄電子檔，真實世界最常見的上傳方式是**手機拍紙本**。所有真實個資測完即清除（DB＋Storage，含刪除確認），未留存於任何文件或 commit。

**OCR 排程最終拍板（2026-07-16）**：儘管文字型 PDF 路線覆蓋率天花板可能只有一到兩成，**PO 決定維持原計畫，OCR 排在 E2-F3 之後、不因此提前**——先把文字型管線＋手動輸入 fallback 做穩、資料模型穩定後再接 OCR，避免插隊重排造成整合成本與風險。Sprint 7 已 commit＋push。

Sprint 6（E2-F1 上傳會話與預覽模組）：已 commit（`b2b413f`）＋push＋正式站部署驗證通過。⚠️ A21（惡意檔案掃描缺口）正式生效，登記 KB-021。

## 4. 下一步
Sprint 7 已 commit＋push，OCR 排程已拍板（維持原計畫、排 E2-F3 之後）。接下來評估 Sprint 8 範圍：續攻 E2-F3／E2-F4（結構化健檢資料儲存＋比對），抽取準確率調校（已知缺陷：多欄表格參考區間污染、單位常抓不到、頁首誤判）視情況並行或後補。KB-018／KB-020 待 PO 決定處理時機（非阻塞）。Sprint 7 正式站部署時機待 PO 決定。

## 5. 最高優先事項
Sprint 8 DOR 規劃（E2-F3 或後續 Feature）；KB-018（RLS BYPASSRLS）與 KB-020（E1-F2 登入問題，C6 牴觸）待決定處理時機；高風險 PoC 依序：E2-F2（機制完成，真實覆蓋率結論見 KB-023，OCR 排程已拍板）、E4-F3 引用驗證。

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
