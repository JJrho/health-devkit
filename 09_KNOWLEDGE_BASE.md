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

## KB-008 Zeabur 部署形態與機密流程（Sprint 2 定型）
- 類型：部署決策＋接入教訓（2026-07-12）
- 內容：(1) 部署於 PO 現有 Linode Tokyo 專屬伺服器（1C/2GB，與 Supabase 同城；資源吃緊再升級）；(2) 同 repo 兩 service：web（自動偵測 Next.js）＋worker（zbpack.worker.json 指定啟動）；(3) Zeabur 的 GitHub App 授權與 Supabase 的 GitHub 整合是**兩個獨立授權**；(4) 機密設定：腳本從本機 .env 讀值直送 CLI、輸出遮蔽——金鑰永不經對話；(5) 專案／service ID 記於 CLAUDE.md
- 未來避免：Worker 的執行期依賴（如 tsx）必須放 dependencies 而非 devDependencies

## KB-009 Supabase 新版 sb_secret_ 金鑰不被 GoTrue Admin API 接受
- 類型：接入教訓（Sprint 3，2026-07-13，正式站實測發現）
- 內容：新版不透明 service_role 金鑰（`sb_secret_...`）打 `/auth/v1/admin/*`（`auth.admin.listUsers`／`updateUserById`／`getUserById`）直接回 401 `no_authorization`；資料庫查詢與一般 Data API 不受影響，只有 GoTrue Admin API 這條路徑會擋。症狀：API 回 200 但 body 全空、自訂 header 也消失（handler 中途拋例外，非邏輯錯誤）。
- 修法：改用不依賴 Admin API 的官方標準流程——(1) 查重複 Email：`signUp()` 對已存在帳號回傳 `identities: []`（防枚舉設計，直接可判斷）；(2) 重設密碼：`verifyOtp()` 成功即取得 session，同一 client 直接 `updateUser({password})`，不必經 admin。
- 未來避免：本專案往後**一律避開** `auth.admin.*`；`getUserById`（AuthAdapter 介面尚存但無人呼叫）如未來要用，須先驗證 Admin API 是否已恢復支援或改走其他管道。**併發注意**：`resetPasswordWithToken` 因需要 `setSession`/`updateUser` 綁定单一使用者 session，改用**請求範圍建立的獨立 client**（非共用單例），避免多請求併發時互相污染 session 狀態。

## KB-010 API route 必須有頂層例外防護網，否則例外＝空 body 而非乾淨 500
- 類型：架構修正（Sprint 3，2026-07-13，正式站兩度撞見同一症狀後定位）
- 內容：六支 auth API route 原本只在 `request.json()` 包 try/catch，service／adapter 呼叫本身沒包。任何未預期例外（KB-009 的 Admin API 401、Supabase `email_address_invalid` 等）會讓回應變成**狀態 200 但 body 全空、自訂 header 也消失**——不是乾淨的 500。前端據此誤判為「連線問題」而非顯示明確錯誤。
- 修法：建立 `src/lib/api-handler.ts` 的 `withErrorEnvelope()` wrapper，包住所有 route handler；任何未捕捉例外一律轉統一 500 error envelope（`INTERNAL_ERROR`，訊息不含例外細節，日誌只記 errorName）。可預期的使用者輸入錯誤（如 Email 格式不合法）改在 adapter／service 回結構化結果，不當例外拋出。
- 未來避免：**新增任何 API route 一律套用 `withErrorEnvelope`**，不要各自寫 try/catch；新的可預期錯誤（Supabase 特定 error.code）評估是否該回結構化結果而非例外。

## KB-011 Supabase 免費方案信件寄送限流（A7 已知限制，實測命中）
- 類型：接入教訓（Sprint 3，2026-07-13）
- 內容：多輪診斷測試（重複呼叫 signUp）於短時間內耗盡 Supabase 免費方案的每小時信件配額，之後的 register() 呼叫回 `over_email_send_rate_limit`。這正是 DOR A7 事先標記的已知限制。
- 修法：`over_email_send_rate_limit` 已在 SupabaseAuthAdapter 結構化為 `EMAIL_RATE_LIMITED` 結果（非例外），API 回 429＋溫和訊息，不再是裸 500。
- 未來避免：**本機／CI 手動測試註冊流程時節制呼叫次數**，避免佔用配額影響真實使用者；正式對外前必須依 A7 接自有 SMTP。

## 待觀察項：pg-queue-adapter 整合測試偶發性失敗（非本輪程式缺陷）
- 現象：`pnpm test` 完整套件執行時，`失敗路徑：fail 遞增 retry_count、回 pending 重試（AC-4）` 測試偶爾斷言失敗（retry_count 提前達到 max_retries）；同一測試檔單獨執行、或完整套件重跑，皆穩定通過。研判為測試執行期間某種時序/併發因素導致，非 QueueAdapter 本身邏輯錯誤（Worker 於 Zeabur 雲端已多次實測行為正確，見 Sprint 1/2 SPRINT_LOG）。
- 處置：Sprint 3 範圍不含 Sprint 1 測試基礎設施排查，暫記待觀察；若未來重現頻率上升或伴隨其他測試檔一起表現異常，再排入對應 Sprint 深入排查。

## KB-012 密碼重設改走 Supabase implicit recovery flow（免費方案 Email 樣板鎖死）
- 類型：架構修正（Sprint 3，2026-07-15，PO 實測發現流程無限迴圈）
- 內容：Supabase 免費方案未設定自訂 SMTP 前，Email 樣板（含 Reset Password）**無法編輯**，一律用預設樣板。預設樣板走 implicit recovery flow：驗證在 Supabase 伺服器端完成，結果以網址 `#access_token=...&type=recovery`（成功）或 `#error=...`（失敗／過期）夾帶回 Site URL，**不會**用我們原本設計的 `token_hash` query 參數格式，導致原本以 query 參數為基礎的 `/reset-password` 頁面完全收不到有效資訊，使用者點信件連結後陷入「跳回首頁／忘記密碼頁」的無限迴圈，且看不出成功或失敗。
- 修法：改為官方推薦的瀏覽器端模式——`src/adapters/supabase-browser-client.ts`（僅 anon key，可安全暴露前端）＋根 layout 全域掛載 `RecoveryHashRouter`（監聽 hash 是否含 `error=` 或觸發 `PASSWORD_RECOVERY` 事件，統一導向 `/reset-password`）＋該頁改在瀏覽器端直接呼叫 `updateUser()`。移除原本後端的 `resetPasswordWithToken`／`/api/auth/reset-password`（不再可達，刪除死碼）。頁面一進去就明確顯示「連結驗證成功／已過期」，不再讓使用者猜測狀態。
- 未來避免：若之後設定自訂 SMTP 解鎖樣板編輯，token_hash 式作法可重新評估是否啟用；瀏覽器端 Supabase 呼叫需要 `NEXT_PUBLIC_SUPABASE_URL`／`NEXT_PUBLIC_SUPABASE_ANON_KEY`（.env 與 Zeabur 皆需設定，值與伺服器端版本相同，非機密）。

## KB-013 Zeabur 專屬伺服器（1C/2GB）記憶體吃緊，勿同時重啟多個 service
- 類型：維運教訓（Sprint 3，2026-07-15，實測觸發）
- 內容：`health-devkit` 的 web＋worker 與另一專案 `yihan-devkit` 共用同一台 Linode Tokyo 1C/2GB 專屬伺服器。穩態下 web≈315MB、worker≈250-300MB，伺服器整體使用率平時已達七成以上。**同時重啟 web 與 worker** 會讓舊 pod（尚未關閉）與新 pod（正在啟動）短暫並存，記憶體需求瞬間翻倍，觸發 Kubernetes MemoryPressure 逐出（evict）、進而陷入「重排程→再逐出」的循環，導致服務短暫中斷（502）。
- 修法：本次靜待數分鐘後系統自行恢復穩定，未再介入。
- 未來避免：**需要重啟多個 service 時，一次只重啟一個、確認穩定（health 端點 200）後再重啟下一個**；日誌輪替／密碼輪替等操作若需要重啟，比照辦理。長期若此類事件頻繁發生，考慮升級伺服器規格。

## KB-014 Supabase pooler 斷路器：認證失敗次數過多會暫時封鎖新連線（含正確密碼）
- 類型：維運教訓（Sprint 3，2026-07-15，長時間 DB 連線失敗後才定位）
- 內容：密碼輪替過程中，Zeabur 上尚未更新到新密碼的 pod（web/worker）會持續用**舊密碼**嘗試連線並失敗；這些失敗累積到一定次數，觸發 Supabase Transaction pooler 的斷路器（`ECIRCUITBREAKER`），之後**即使密碼已經正確**，新連線一樣會被暫時封鎖，回傳籠統的 `password authentication failed`，與真正密碼錯誤的症狀完全相同、無法從錯誤訊息分辨。這造成「重設密碼→看似沒用→再重設」的循環，每次重試更可能延長封鎖時間。
- 診斷關鍵：`service exec` 進容器直接跑本專案的 `verify-db.ts`（見 scripts/），若真正原因是斷路器，會看到明確的 `(ECIRCUITBREAKER) too many authentication failures, new connections are temporarily blocked`，而非單純的密碼錯誤訊息。
- 修法：**停手等待冷卻**（無法主動解除，需等 Supabase 端計時器過期，實務約 10-15 分鐘），冷卻後乾淨測一次即可恢復。
- 未來避免：**輪替密碼／金鑰時，務必一次到位、同步更新所有會連線的 service（web＋worker）再重啟，不要分批多次改**；每一輪失敗的連線嘗試都在累積斷路器計數，分批修正只會讓情況更糟。若連線失敗訊息長時間不隨密碼修正而改善，優先懷疑斷路器而非密碼本身，直接用 `service exec` 執行驗證腳本查看完整錯誤訊息。

## 新紀錄模板
（依方法論 13.2 節）
