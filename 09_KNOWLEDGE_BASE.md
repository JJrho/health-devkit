# Knowledge Base — 個人健康檢查管理平台

## KB-001 單一 HTML 原型路線已正式廢止
- 類型：架構決策（技術選型 v1_0_0 §1、§21.1）
- 內容：舊「單一 HTML＋本機解析＋不保存」僅可作 UI 原型；正式 MVP 自 Stage 0 即需 DB、Migration、Storage abstraction
- 未來避免：不得在原型碼上疊功能演進成正式版（方法論 19.2 原型鐵則）
- 已升級：憲法 §1

## KB-002 未確認資料不入正式分析＝本產品第一鐵則
- 類型：產品安全決策
- 內容：AI 讀錯數值而使用者照做是最大傷害路徑；人工確認是必要闖關，不是可跳過的 UX 摩擦
- 已升級：憲法 §3、SDD §4.5

## KB-003 Firestore 不作核心庫（與遺憾留言網站相反的選擇）
- 類型：技術決策
- 內容：本案 25 表深關聯＋交易＋版本鏈＋稽核 → PostgreSQL；遺憾留言網站淺關聯＋即時 → Firestore。同一個 PO、不同資料形狀、不同答案——選型跟著資料形狀走，不跟著習慣走
- 已升級：憲法 §1

## KB-004 專案路徑必須純英文（Node 在 CJK 路徑直接崩潰）
- 類型：環境教訓（Sprint 1，2026-07-12）
- 內容：原路徑含中文（`個人健康管理專案\...初始化包...`），Node 22 的 CJS require 一律 access violation（0xC0000005）；同檔案搬到 ASCII 路徑即正常。esbuild／Next／Playwright 原生模組在 CJK 路徑另有多個已知問題
- 未來避免：任何 Node 專案一律建在純英文路徑。本案正式位置：`C:\Users\jr_ho\Desktop\Medical-AI-Work\health-devkit`

## KB-005 pnpm 11 兩個必要設定（pnpm-workspace.yaml）
- 類型：環境教訓（Sprint 1）
- 內容：(1) 原生依賴的 postinstall 預設被封鎖，需 `allowBuilds`（esbuild/sharp/unrs-resolver）；(2) `verifyDepsBeforeRun: false`——run 前的依賴檢查子程序在受限環境會崩潰，依賴一致性由 lockfile 保證
- 未來避免：新環境 clone 後若 `pnpm run` 異常，先查這兩項

## KB-006 Supabase 連線三種憑證，別混用
- 類型：接入教訓（Sprint 1，PO 實際踩過的順序）
- 內容：(1) `DATABASE_URL` 用的是「資料庫密碼」（建專案時設定，可在 Settings→Database 重設），不是帳號登入密碼、不是 API 金鑰；(2) 替換 `[YOUR-PASSWORD]` 時只換該段，`:` 與 `@` 及其後主機段必須保留；(3) `SUPABASE_URL` 是專案根網址，不含 `/rest/v1/`；(4) DB 密碼建議純英數，避免 URL 編碼問題
- 未來避免：真實金鑰只進 `.env`，永不進 `.env.example`／版控／對話

## KB-007 佇列整合測試必須自我隔離
- 類型：測試教訓（Sprint 1 實際踩雷）
- 內容：`claimNext` 撿「最舊的 pending」——前一測試留下的 pending 工作會被後一測試撿走造成誤判。修法：beforeAll 清殘留、各測試收尾清理自己的工作；且測試執行期間 Worker 不得同時運行
- 未來避免：E2-F2 擴充佇列時沿用此隔離模式

## 新紀錄模板
（依方法論 13.2 節）
