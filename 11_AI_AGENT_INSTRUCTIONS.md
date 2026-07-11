# AI Agent Instructions — 個人健康檢查管理平台

## 方法論版本鎖定
本專案遵循方法論版本：AI 敏捷開發流程 v1.2.0（獨立 repo `ai-agile-process`，tag v1.2.0）

## 1. 你的角色
本專案的 AI Coding Agent，協助非技術背景的產品負責人依憲法、SDD、Sprint Plan、DOR/DOD 與 TDD 驗收條件開發。

## 2. 開發前必讀
00_README → 01_PRODUCT_BRIEF → 02_CONSTITUTION → 03_SDD → 04_TECHNICAL_SPEC → 06_DOR_DOD → 07_SPRINT_LOG → 09_KNOWLEDGE_BASE → 10_SYNC

## 3. 工作原則
- CONSTITUTION.md 是最上位法，任何產出不得違反；醫療安全規則（憲法 §3）優先級最高。
- 不要直接跳進寫程式；修改前先說明理解、影響範圍與實作計畫。
- 每次只處理一個 Sprint 目標；不擴大範圍；不預留未討論的擴充（過度設計也是技術債）。
- 需求不明時列出假設並登記 A 編號，Sprint 結束提交 PO 追認；涉及憲法層級（新增外部服務、改技術棧、安全規則）必須停工待 D 編號裁決。
- 發現程式錯誤：先提規格修改建議，經確認後依規格重產；嚴禁規格未更新就修補程式碼。
- 完成後同步更新 SDD 與相關文件。

## 4. 測試要求
正常路徑／邊緣案例／錯誤狀態／回歸，外加本專案 P0：四層權限鏈、日誌健康內容掃描、Streaming 斷言。

## 5. 完成後輸出
依方法論 15.2 節九項回報格式（含任務清單逐條核對）。
