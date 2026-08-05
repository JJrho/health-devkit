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
- **更新（2026-07-15，Sprint 4 排查 C6 登入問題時重驗）**：`admin.listUsers()` 現在正常回應（非 401），與本條原始記載不符——Supabase 端可能已修復相容性。**在真正依賴 Admin API 前，務必用一次性診斷腳本重新確認**，不要直接假設本條仍然成立；但即使 Admin API 可用，也不代表適合用來「繞過」email 確認登入（見 C6 相關新發現）。

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
- 未來避免：**需要重啟多個 service 時，一次只重啟一個、確認穩定（health 端點 200）後再重啟下一個**；日誌輪替／密碼輪替等操作若需要重啟，比照辦理。
- **後續**：PO 已於 2026-07-15 將伺服器由 1C/2GB 升級為 **2C/4GB**，穩態使用率從七成以上降至約四成，問題根治。升級後單次 `service exec` 額外程序仍可能在舊規格下被 OOM 砍掉（見 KB-016），新規格下未再重現。

## KB-014 Supabase pooler 斷路器：認證失敗次數過多會暫時封鎖新連線（含正確密碼）
- 類型：維運教訓（Sprint 3，2026-07-15，長時間 DB 連線失敗後才定位）
- 內容：密碼輪替過程中，Zeabur 上尚未更新到新密碼的 pod（web/worker）會持續用**舊密碼**嘗試連線並失敗；這些失敗累積到一定次數，觸發 Supabase Transaction pooler 的斷路器（`ECIRCUITBREAKER`），之後**即使密碼已經正確**，新連線一樣會被暫時封鎖，回傳籠統的 `password authentication failed`，與真正密碼錯誤的症狀完全相同、無法從錯誤訊息分辨。這造成「重設密碼→看似沒用→再重設」的循環，每次重試更可能延長封鎖時間。
- 診斷關鍵：`service exec` 進容器直接跑本專案的 `verify-db.ts`（見 scripts/），若真正原因是斷路器，會看到明確的 `(ECIRCUITBREAKER) too many authentication failures, new connections are temporarily blocked`，而非單純的密碼錯誤訊息。
- 修法：**停手等待冷卻**（無法主動解除，需等 Supabase 端計時器過期，實務約 10-15 分鐘），冷卻後乾淨測一次即可恢復。
- 未來避免：**輪替密碼／金鑰時，務必一次到位、同步更新所有會連線的 service（web＋worker）再重啟，不要分批多次改**；每一輪失敗的連線嘗試都在累積斷路器計數，分批修正只會讓情況更糟。若連線失敗訊息長時間不隨密碼修正而改善，優先懷疑斷路器而非密碼本身，直接用 `service exec` 執行驗證腳本查看完整錯誤訊息。

## KB-015 PowerShell Get-Content 對含 CJK 註解的 .env 檔案編碼誤判
- 類型：環境教訓（Sprint 3，2026-07-15，兩度踩雷）
- 內容：`.env` 檔案內含中文（CJK）註解時，PowerShell 的 `Get-Content`（不指定編碼）會誤判整體編碼，導致：(1) 終端機顯示亂碼；(2) 更嚴重的是，`-match '^KEY='` 這類 regex 結構檢查會對**特定行**（通常是中文註解正下方那一行）判斷失敗，回報「這個 key 不存在」，即使該行實際存在且內容正確。此現象與 `Read` 工具（正確解碼 UTF-8）的結果不一致，曾造成「明明填了 SUPABASE_SERVICE_ROLE_KEY 卻讀不到」的誤診斷，浪費大量時間排查。
- 修法：`Get-Content` 一律加上 **`-Encoding UTF8`** 明確指定編碼，才能正確逐行解析。
- 未來避免：任何要用 PowerShell 讀取／檢查 `.env` 或其他含中文內容檔案的腳本，一律加 `-Encoding UTF8`；若結果與預期不符且懷疑是編碼問題，改用能正確解碼的方式重新確認結構（而非直接假設值不存在）。

## KB-016 Zeabur CLI 的 `service exec` 無法傳遞帶減號的旗標給容器內指令
- 類型：工具限制（Sprint 3，2026-07-15）
- 內容：`npx zeabur@latest service exec --id <id> -- sh -c "echo hello"` 這類指令，即使用 `--` 分隔，CLI 仍會把 `-c`（或 `--eval` 等任何以減號開頭的 token）誤判為自己的旗標，回報 `unknown shorthand flag`。純位置參數（如 `ls`、`env`、`pnpm exec tsx scripts/foo.ts`）不受影響。
- 修法：需要在容器內執行複合指令／inline script 時，改成執行**專案內已存在、不需任何旗標的腳本**（例如 `pnpm exec tsx scripts/verify-db.ts`），而非嘗試用 `sh -c`／`node --eval` 現場組指令。
- 未來避免：診斷 Zeabur 容器內狀態時，先寫一支不需旗標的 tsx 診斷腳本（放 `scripts/`，用完即刪），再用 `service exec` 執行；不要嘗試用 shell 內嵌指令。

## KB-017 本機 pnpm build/start 診斷後殘留 .next 與殭屍 port，會讓後續 dev/e2e 出現假性 404
- 類型：本機環境教訓（Sprint 3，2026-07-15）
- 內容：為了重現 Zeabur production build 的行為，本機跑過 `pnpm build && pnpm start` 之後，若沒有徹底清乾淨就切回 `pnpm dev` 或 `pnpm test:e2e`，會出現兩種假性故障：(1) 殘留的 `.next`（production build 產物）與 dev 模式的內部結構不相容，導致明明存在的頁面（如 `/reset-password`）回報 404；(2) `pnpm start` 起的 process 沒被完全終止、占用 3000 埠，導致 Playwright 的 dev server 改用 3003 卻仍等待 3000 而逾時失敗。兩者症狀都容易誤判為程式碼壞掉。
- 修法：`rm -rf .next test-results playwright-report`；用 PowerShell `Get-NetTCPConnection -LocalPort 3000 | Stop-Process` 確實清掉佔用 3000 的殭屍程序（Bash 的 `pkill` 在此 Windows 環境下對這類程序不可靠）；之後再重跑 `pnpm dev`／`pnpm test:e2e`。
- 未來避免：任何一次本機 production build 診斷（`pnpm build`／`pnpm start`）結束後，**立即**清 `.next` 並確認 3000 埠已釋放，才能切回一般開發／測試流程。

## KB-018 Supabase 專用連線角色 BYPASSRLS，RLS 政策對 app 自身連線不生效
- 類型：架構限制（Sprint 4，2026-07-15，E1-F4 實作中發現）
- 內容：本專案的 `DATABASE_URL` 走 Supabase Transaction pooler 連線，角色為 `postgres`（專案擁有者角色），查詢 `pg_roles` 確認 `rolbypassrls=true`。這代表任何在資料表上建立的 RLS 政策，對這條連線本身**完全不生效**（BYPASSRLS 角色的查詢一律跳過政策檢查），無論政策寫得多正確。
- 影響：SDD §7「RLS 為第二道防禦」目前**形同虛設**——`projects` 表已建好 `ENABLE ROW LEVEL SECURITY`＋owner_id 政策（見 `drizzle/0002_chilly_chat.sql`），但實際擋跨帳號存取的只有應用層四層權限鏈（`src/modules/projects/access.ts`）這一道防線。
- 修法（尚未執行，需 PO 確認後再動手）：另建一個不具 `BYPASSRLS` 的專用 Postgres 角色，僅授予必要的 table 權限，並改接 `DATABASE_URL` 使用該角色——牽涉 Supabase 角色新增＋Zeabur web／worker 雙 service 環境變數同步更新，屬正式環境憑證異動，比照 KB-013/KB-014 教訓「一次到位、勿分批」處理。
- 未來避免：**任何後續 Feature 若也想靠 RLS 當第二道防禦，先用 `select rolbypassrls from pg_roles where rolname = current_user` 確認目前連線角色是否真的受 RLS 約束**，不要假設「建了政策就有效」。診斷腳本用完即刪，不留在 `scripts/`。

## KB-019 多個測試檔共用同一 `@test.invalid` LIKE 萬用字元清理，新增 FK 參照表後會互相炸鍋
- 類型：測試基礎設施教訓（Sprint 4，2026-07-15，新增 `projects` 表後首次觸發）
- 內容：`tests/unit/auth-service.test.ts` 的 `afterAll` 用 `like(users.email, "%@test.invalid")` 掃描並清除測試使用者。新增 `projects` 表（FK 參照 `users.id`）後，若另一份測試檔（如 `projects-service.test.ts`）建立的測試使用者 email 也以 `@test.invalid` 結尾，兩個測試檔在 vitest 預設平行執行下會互相清到「對方仍有 FK 參照、自己還沒清完」的使用者，導致 `update or delete on table "users" violates foreign key constraint` 而整個測試檔判定失敗（儘管個別 `it` 斷言全數通過）。
- 修法：新增測試檔改用**不同網域尾綴**（例如 `@projects.test.invalid`），與既有 `auth-service.test.ts` 的 `%@test.invalid` 萬用字元不重疊，兩者互不清到對方資料。
- 未來避免：**未來任何新表若會被測試以 `@test.invalid` 開頭的帳號建立且有 FK 參照 `users`，一律替該測試檔取一個獨立的網域尾綴**，不要與其他測試檔共用同一個萬用字元收尾模式；若真的需要共用清理邏輯，改成各測試檔追蹤自己建立的 user id 陣列，而非重新查詢萬用字元。
- **更新（2026-07-15，Sprint 5 新增 `health_profiles` 表後再度觸發）**：`profiles-service.test.ts` 沿用 `@projects.test.invalid`（與 `projects-service.test.ts` 同網域，因需要建立真實 `projects` 列），結果 `projects-service.test.ts` 原本的 `afterAll` 直接 `DELETE FROM projects` 未先清 `health_profiles`，被新表的 FK 擋下。**根本原則其實不是「網域要不要獨立」，而是：任何刪除某表的清理邏輯，都必須先刪光「所有」FK 參照它的表——包含寫這段清理程式碼當下還不存在、之後才新增的表**。網域區隔只能防「不同測試檔的使用者互相誤刪」，防不了「同一批使用者底下，新表接到舊表的 FK 鏈」。修法：`projects-service.test.ts` 的 `afterAll` 改為刪除前先查出該使用者名下所有 `projects`，逐一清 `health_profiles` 後才刪 `projects`。**未來每新增一張會被既有測試資料 FK 參照的表，都要回頭檢查所有可能觸及該資料的既有測試檔清理順序**，不能只顧新測試檔自己的 `afterAll`。
- **更新（2026-07-16，Sprint 7 新增 `extraction-service.test.ts` 後才發現的更根本問題）**：到這一輪，`projects-service.test.ts`／`profiles-service.test.ts`／`documents-service.test.ts`／`extraction-service.test.ts` 四個檔案全部共用同一個 `@projects.test.invalid` 網域（各自 seed 時用不同前綴 `proj-`／`profile-`／`doc-`／`extract-` 區分），但四個檔案的 `afterAll` 全都用**同一個廣義萬用字元** `like(users.email, "%@projects.test.invalid")` 掃描清理——完全沒有用到各自的前綴！結果四個檔案平行執行時，每個檔案的 `afterAll` 都會掃到**其他三個檔案還在使用中的使用者**一起刪，導致：(1) 正在跑的測試其資料被別的檔案的收尾提前刪掉（`AC-4` 測試讀到 `document` 是 `undefined`）；(2) 多個檔案同時對重疊的列做 `DELETE` 造成 row lock 互相卡住，`afterAll` 直接 hook timeout（10 秒）。**網域區隔只能防「不同批次資料互相誤刪」，前綴沒對上萬用字元，區隔等於沒做**。修法：四個檔案的 `afterAll` 一律把 `like()` 條件從 `"%@projects.test.invalid"` 收緊為各自的前綴，例如 `"extract-%@projects.test.invalid"`，確保每個檔案只掃到自己建立的使用者。
- **未來避免（本條最終版原則）**：**多個測試檔共用同一個網域尾綴時，seed 時給的前綴必須同步反映在 `afterAll` 的清理查詢裡**——只取「網域尾綴獨立」是不夠的，前綴也要獨立到查詢條件裡，否則等於白區隔。新增測試檔前，順手檢查同網域下其他檔案的 `afterAll` 是不是也犯了同樣的「seed 有前綴、清理沒吃前綴」的疏漏。

## KB-020 未驗證帳號無法登入，與 C6 牴觸（PO 2026-07-15 決定暫緩修復）
- 類型：已知限制（Sprint 4，2026-07-15，E1-F4 手動驗證時發現）
- 內容：全新註冊、尚未點驗證信的帳號，走真實 Supabase `signInWithPassword` 一律回 `email_not_confirmed`（400），與 C6「未驗證帳號可登入、可建專案；上傳與 AI 鎖定至驗證完成」直接牴觸。Sprint 3 的自動化測試（`tests/unit/auth-service.test.ts`）用 `FakeAuthAdapter`，從未真正打到 Supabase，故未發現；PO 當時的正式站實測結論待確認是否恰好用了已驗證帳號。
- 為何沒有直接修：唯一乾淨的修法是關閉 Supabase 專案的「Confirm email」設定（Authentication → Sign In / Providers → Email），但**不確定**關閉後 Supabase 是否會把所有新帳號的 `email_confirmed_at` 在註冊當下就直接設為已驗證——若是如此，C6 原本「未驗證但可登入、上傳/AI 鎖定」的中間狀態會被整個抹除，等於連帶砍掉一個既有設計意圖，而不只是解除登入阻擋。這個行為需要先在真實環境驗證才能確認，且是帳號安全設定變更，不應該在沒把握的情況下直接切換。
- 已重新確認：KB-009 記載的 GoTrue Admin API 401 問題**目前已不存在**（`admin.listUsers()` 正常回應）；但 Admin API 沒有「驗證密碼」端點，無法用來繞過 `signInWithPassword` 的 confirm-email 檢查，且用 Admin API 在註冊當下就強制 `email_confirm: true` 會跟關 Supabase 設定一樣，抹掉未驗證狀態——同樣的兩難。
- PO 決定（2026-07-15）：本輪不修，先記錄為已知限制。
- 未來處理時的路線圖：(1) 先在 Supabase 找一個非正式環境（或用一次性診斷腳本＋測試帳號）驗證「Confirm email 關閉」對 `email_confirmed_at` 的實際行為；(2) 若確認會被抹除，需改為在我方應用層獨立追蹤「是否真的點過驗證信」（例如：`/auth/verified` 落地頁偵測 URL 是否帶有 Supabase 回傳的驗證 token，而非單純判斷頁面有無被開啟），不再依賴 Supabase 的 `email_confirmed_at` 作為 C6 的判斷來源；(3) 若確認不會被抹除，直接關閉設定即可，屬於低風險修正。

## KB-021 惡意檔案掃描缺口正式上線生效（A21，E2-F1）
- 類型：已知限制（Sprint 6，2026-07-16）
- 內容：上游規格 §20「執行惡意檔案掃描」自 E2-F1（上傳功能）上線起即為真實缺口——目前僅以內容格式驗證（magic bytes：PDF/JPG/PNG）＋大小上限（20MB）＋PDF 頁數上限（30 頁）＋僅限已驗證帳號（C6）作為第一道防線，**未接任何 AV/惡意檔案掃描服務**。05_BACKLOG 對 E2-F1 的外部依賴僅列「Storage bucket」，未列 AV 掃描，屬規劃遺漏（見 sprints/sprint-06-dor.md A21，PO 2026-07-15 已知悉並同意本輪不處理）。
- 影響範圍：任何通過格式驗證的 PDF/JPG/PNG（即使內嵌惡意 payload，只要檔案結構合法）都會被接受並存入 Storage，供之後預覽／下載。
- 未來處理：建議排入 E6-F2（整合測試與部署交付包，上線前安全項目集中處）或另立待辦；技術選項包括 ClamAV（自架或雲端 API）、VirusTotal API、或 Storage 供應商內建掃描（需查證 Supabase Storage 是否有對應功能）。
- 未來避免：**規劃階段若上游規格明列某項安全需求，即使 Backlog 外部依賴欄位沒列到，實作時也要主動核對規格全文並登記為缺口**，不能因為 Backlog 沒寫就當作不存在（KB-021 本身就是 sprint-06-dor.md 第 13 節「A21 需在 SPRINT_LOG 與 KB 明確記錄」的落實）。
- **✅ 已解決（Sprint 24，2026-07-22，E6-F2，A142）**：改用 VirusTotal API（`src/adapters/virustotal/virustotal-scan-adapter.ts`），`completeUpload()` 於內容驗證通過後、寫入正式 Storage 物件前插入掃描步驟，判定惡意或掃描服務逾時／出錯一律 fail closed 轉 `upload_failed`，詳見 KB-033。

## KB-022 惡意 PDF 解析防護：用逐工作逾時取代訊號比對式掃毒（E2-F2 前置決策）
- 類型：架構決策（Sprint 7 DOR 制定前，2026-07-16，PO 與 AI 討論後拍板）
- 內容：E2-F2 即將在 Worker 端跑真正的伺服器端 PDF 解析（讀文字層＋定位座標）。討論 KB-021（惡意檔案掃描缺口）該不該提前補時，結論是：訊號比對式 AV 掃描（ClamAV／VirusTotal）主要抓「檔案裡藏著已知惡意 payload」，但 PDF 解析器最貼近當下的真實威脅是「檔案結構本身設計來打解析器漏洞」（decompression bomb、觸發無限迴圈、記憶體耗盡）——這類攻擊訊號比對通常抓不到，對「即將開始解析未知結構 PDF」這個威脅模型幫助有限，此時導入完整 AV 掃描服務屬於用高成本解法打錯重點。
- 決策：**E6-F2 仍維持原計畫做正式惡意檔案掃描（KB-021 不變、不提前）**；改為 **E2-F2 的 Worker 端解析工作本輪即加上逐工作逾時／資源上限**，作為對「解析器被惡意結構打」這個更貼近的風險的直接防線——逾時視同處理失敗（`processing_failed`），Worker 不因單一工作卡死整條 pipeline、也不影響其他工作繼續被撿起。這個防線幾乎零額外成本（不需新服務、不需新外部依賴、不需新 Clarify），且比訊號比對式掃毒更準確命中 E2-F2 實際會遇到的風險。
- 落地位置：`src/worker/main.ts` 的 `tick()` 目前呼叫 `handler(job)` 沒有任何逾時包裝；E2-F2 的解析 handler 需要外層加 timeout（如 `Promise.race`），詳見 sprints/sprint-07-dor.md。
- 未來避免：任何要「執行不受信任內容的解析／轉換」的 Feature（例如未來若真的接掃描 OCR、或任何吃使用者上傳內容的新處理管線），開工前先問「這個處理本身有沒有資源／時間上限」，不要預設「外部掃毒服務」就足以涵蓋這類風險——兩者防的是不同的威脅模型，通常都需要。

## KB-023 真實樣本 PoC 結果：86% 健檢報告無文字層，OCR 是覆蓋率的關鍵瓶頸
- 類型：PoC 實測結果＋產品情境（Sprint 7，2026-07-16，PO 提供 7 份自己的真實健檢報告樣本）
- 內容：PO 提供 2020～2025 共 7 份自己（及一位家屬）的真實員工健檢報告 PDF，全數跑過 E2-F2 的解析管線。結果：**只有 1 份（14%）有可抽取的文字層，其餘 6 份（86%）連文字都抓不到**（`pdfjs-dist` 回傳零文字項目），在「準確率」這個問題被評估之前就先卡在「根本進不了這條 pipeline」。唯一成功的那 1 份雖然正確抽出多筆真實數值（身高體重、WBC、膽固醇、血糖等），但也暴露具體的解析邏輯缺陷：多欄表格的參考區間與數值互相污染（如 `90~135mmHg14290~135mmHg`）、單位常抓不到（跟區間文字黏在一起無空白分隔）、頁首病患資訊被誤判成檢驗項目且信心值還偏高（0.95）。
- **PO 提供的關鍵產品情境（why）**：台灣醫療院所的健檢報告預設是**紙本郵寄**，只有**私人健檢中心**在病患**主動提供並填寫 Email** 的情況下才會寄電子檔；一般醫院/診所絕大多數情況直接印紙本寄送。因此**真實世界最常見的上傳方式是「使用者打開紙本、用手機拍照上傳」**，不是「上傳醫院寄來的電子 PDF」——這與 7 份樣本 86% 無文字層的實測結果完全吻合，不是樣本偏差，是台灣健檢報告遞送模式的常態。
- 影響：E2-F2／E2-F3／E2-F4 目前規劃的「文字型 PDF 解析→人工確認→標準化」整條管線，即使做到完美，**天花板可能只覆蓋得到一到兩成的真實使用情境**。OCR 不是「錦上添花的下一步」，是「這條產品路徑能不能服務多數使用者」的關鍵瓶頸，優先順序需要重新評估（原本暫定排在 E2-F3 之後，見 05_BACKLOG／13_ROADMAP 待更新）。
- 技術備註：真實輸入若以手機拍照為主，OCR 設計需考慮的挑戰比單純「掃描機掃描」更多——透視變形／歪斜校正、光線不均／反光、解析度與模糊、單頁可能沒拍全——這些是未來 OCR Feature 開 DOR 時要納入的設計考量，非本輪要解決。
- 已知限制：樣本數仍偏小（7 份，來自同一位 PO 與其少數家屬、同一批雇主健檢），不同產業/年齡層/地區使用者的實際比例可能有差異；但 PO 給出的「遞送模式」解釋具備一般性（不是特定樣本的巧合），可信度高於單純統計數字。

## KB-024 pdfjs 文字合併間距門檻＋「無法辨識」優於「猜測切法」的設計原則
- 類型：技術發現＋設計原則（Sprint 8，2026-07-17）
- 內容：用合成探測腳本（純幾何測試，不含真實資料）逐步縮小 `pdfjs-dist` `getTextContent()` 中兩段相鄰文字的間距，量出明確門檻：
  - 間距 <1.5pt：合併成**一個字串、零分隔字元**（如 `"142"`＋`"90-135"` → `"14290-135"`）——**欄位邊界資訊在到達應用層程式碼之前就已經被 pdfjs 丟棄**，不是格式不好看，是真的遺失
  - 間距 1.5–8pt：合併成一個字串，但**字串內含真正的空白字元**（這個區間不需要額外處理）
  - 間距 ≥8pt：保持為獨立 item
  - `disableCombineTextItems: true` 選項對此**沒有影響**（曾懷疑是 combineTextItems 的合併行為，實測證實無關，門檻由物理間距決定，與此選項無關）
- 設計原則（PO 2026-07-17 拍板，first priority）：對 <1.5pt 這種邊界資訊已遺失的殘留字串，**不嘗試用規則猜測原始切法**（如把 `"14290-135"` 猜成 `"142"`＋`"90-135"`）——因為從字串本身無法可靠判斷真正的切點，猜錯是「自信地錯」。正確做法是驗證內容形狀，通不過驗證的欄位維持 `null`，前端顯示「無法辨識」，交由使用者之後自行輸入（E2-F3 範圍）。對應憲法 §3 醫療安全：「誠實地不完整」優於「自信地錯」。
- 已知殘留限制：若黏合後的殘留字串**語法上恰好合法**（如 `"14290-135"` 沒有單位字尾、看起來就是個普通區間），純規則驗證無法分辨這是巧合還是真正的區間——這是資訊遺失造成的根本限制，任何純字串規則都無法完全解決，需要真正的表格結構辨識或 OCR 才可能突破。
- 未來避免／應用：任何依賴 pdfjs（或其他 PDF 文字抽取函式庫）座標做結構化解析的功能，開工前應先用類似的合成探測腳本量測該函式庫的實際合併行為，不要依賴「聽起來合理」的假設直接動手改程式碼——這正是 Sprint 8 一開始 DOR 訂的 A26 方向（依 x 間距重新拼接 item）被實測推翻、改採內容驗證的直接教訓。

## KB-025 Worker service 缺少 SUPABASE_URL 環境變數，導致 parse-document 全面失敗
- 類型：部署缺口（Sprint 8，2026-07-17，部署驗證時發現）
- 內容：Sprint 8 部署後，正式站 worker 對**任何**文件的解析工作都失敗（重試 3 次全敗），包括跟 Sprint 7 驗證過的樣式完全相同的簡單合成 PDF——不是內容問題，是環境問題。本機用完全相同的程式碼與資料可成功處理，證明不是邏輯錯誤。加臨時診斷 log（繞過 logger 白名單、只印通用基礎設施錯誤訊息，非健康內容）重新部署一次後，抓到真正原因：**worker service 缺少 `SUPABASE_URL` 環境變數**（`src/lib/env.ts` 的 `requireEnv` 直接拋錯）。已補上（值與 web service 的 `NEXT_PUBLIC_SUPABASE_URL` 相同，屬非機密值，見 `.env.example` 註解）。
- 影響範圍：目前不確定此變數是何時遺失的（Sprint 7 當時 worker 明確能正常存取 Storage，代表當時是有的）；不排除是先前某次 Zeabur 環境變數操作時意外遺漏，需列入待查但非本輪阻塞項。
- 未來避免：**部署驗證不能只看 `deployment list` 狀態轉 `RUNNING` 或 `/api/health` 200 就結案**——這兩者都只證明服務「有啟動」，不證明「功能正常」。有實際跑得動的工作管線（如本案的 parse-document）時，應該像本輪最後做的一樣，跑一次真實資料的端到端功能驗證，才能抓到這類「服務健康但功能壞掉」的缺口。

## KB-026 第四次意外機密外洩：`zeabur variable create/update` 指令本身會印出完整變數表
- 類型：安全事故＋規則強化（Sprint 8，2026-07-17）
- 內容：診斷 KB-025 時需要幫 worker 補上 `SUPABASE_URL`，執行 `zeabur variable create --id <worker> -k "SUPABASE_URL=..."` 並用 `grep -v` 過濾掉自己新增的那個值——但沒想到 **CLI 執行成功後會主動印出該 service「整個現有變數表」作為確認訊息**，把跟本次操作完全無關的既有機密（`PASSWORD`、`SUPABASE_SERVICE_ROLE_KEY`）也一併印了出來，grep 過濾只堵住了預期中的值，沒堵住這個非預期的副作用。這是本專案第 4 次意外機密外洩（Sprint 3 三次，記於 07_SPRINT_LOG「三次意外機密外洩」；本次為第 4 次），且與 Sprint 3 的「Zeabur CLI 變數列表輸出未完整遮蔽」是**同一種失誤模式**——舊規則只點名 `zeabur variable list`，沒有涵蓋 `create`／`update` 也有相同副作用，導致規則被字面遵守但精神被違反。
- **已完成處置**：`SUPABASE_SERVICE_ROLE_KEY` 與資料庫密碼（`PASSWORD`／`DATABASE_URL`）皆已由 PO 於 Supabase 後台重新產生，新值已同步更新至 web／worker 兩 service，兩 service 依序重啟並確認 `/api/health` 穩定、worker 端到端功能驗證通過，本機 `.env` 也已用腳本同步更新（未使用 Read／cat 等會顯示內容的工具）。
- **規則強化（已寫入 CLAUDE.md）**：不再只禁止 `zeabur variable list`，而是**禁止直接執行任何 `zeabur variable create／update／delete` 指令並直接查看其標準輸出**——這類指令一律先把整個輸出重導向到檔案，再用 `grep -c` 之類只回傳數字／布林的方式確認成功與否，讀完立刻刪除該檔案，永不用 Read／cat／不帶重導向的方式查看。
- 未來避免：任何「這個工具的正常回應可能夾帶非預期內容」的假設都要當作真的會發生來設計防線，不能靠「先設想它會印什麼、只過濾那個」的方式防禦——應該預設**指令的標準輸出整體不可信任**，只透過重導向＋窄範圍二次查詢取得必要資訊。

## KB-027 消失多年的「完整上游規格」找到了：archive/ 長期是空的懸空引用
- 類型：文件完整性事故＋修復（Sprint 9 開工前，2026-07-17）
- 內容：撰寫 Sprint 9（E2-F3）DOR 前的研究發現，`00_README.md`／`03_SDD.md`／`08_TDD_ACCEPTANCE_TESTS.md` 多處引用的「archive/ 上游規格 §17／§18.1／§22.x／§28.x／§29／§30／§31」等章節，**實際上從未存在於 repo 裡**——`archive/` 目錄底下先前只有空的佔位資料夾，這些引用長期查無實據。追問 PO 後，找到並確認了兩組共四份文件：
  1. `健康管理網站規劃-規格整理 v1.2.2.md`＋`健康管理網站設計-技術選型.md`——PO 本機留存的**早期草稿**，無編號章節，技術路線（單一 HTML＋本機解析＋Firebase／Firestore）已被 KB-001／KB-003 明文推翻，內容也與現行憲法有出入（如把中醫／命理列入 In Scope）。
  2. `個人健康檢查管理平台_規格_v1_0_0.md`＋`個人健康檢查管理平台_技術選型_v1_0_0.md`——PO 本機留存的**正式完整版**，逐字含有 §17／§18.1／§22.x／§28.x／§29／§30／§31 等本專案文件反覆引用的章節，與 `03_SDD.md`／`04_TECHNICAL_SPEC.md` 完全對得上血緣，確認就是那份「消失的完整規格」。這兩份文件先前只存在 PO 本機，從未 commit 過。
- **已完成處置**：正式完整版兩份補進 `archive/upstream_spec/`（含 README 說明使用原則）；早期草稿兩份補進 `archive/deprecated_specs/`（含 README 明確標示已推翻，交叉引用 KB-001／KB-003）；`03_SDD.md`／`00_README.md`／`08_TDD_ACCEPTANCE_TESTS.md` 的引用路徑已更正為實際檔案位置；Sprint 9（E2-F3）DOR 原本因規格缺失而登記的多個「本輪自行假設」，已改為引用驗證過的原文重寫（見 sprints/sprint-09-dor.md）。
- 未來避免：專案初期若有「口頭/本機存在但未 commit」的關鍵文件，應在專案骨架建立當下就一併 commit，不要只在其他文件裡留下引用其章節號碼的痕跡卻不確保原始檔案本身進版控——這類懸空引用可能存在很久都不會被發現（本案存在了 8 個 Sprint 才被發現），因為表面上文件系統看起來完整（各文件間互相引用、章節號碼看起來煞有介事），只有真的要逐字核對原文才會發現查無實據。

## KB-028 Zeabur worker 部署交接期競態：`RUNNING` 那一刻起數分鐘內仍可能有舊版程式碼在跑
- 類型：部署驗證方法論發現（Sprint 11，2026-07-18，正式站部署驗證時發現）
- 內容：Sprint 11 部署後，`zeabur deployment list` 確認 web／worker 兩 service 皆已轉 `RUNNING`（commit SHA 與本輪一致）。緊接著跑正式站真實資料端到端驗證：上傳→真實 Worker 解析→確認→標準化，結果 `observations.rawReferenceRange` 是 `null`——但同一份文件的 `extracted_items.rawReferenceRange` 明明正確存有 `"4.0-10.0"`，且 `standardizeDocument` 的程式碼（已 commit、已 push、已部署）明確有 `rawReferenceRange: item.rawReferenceRange` 這一行。相隔約 3 分鐘後**重跑同一支驗證腳本**（新的一筆資料），結果完全正確，`referenceRange` 正確帶出。兩次差異只有時間，程式碼與資料庫 schema 皆未變動，強烈指向：**worker service 顯示 `RUNNING` 的那一刻，舊版程式碼的容器可能還沒被完全終止，仍在跟新容器搶佇列裡的工作**（PG queue 用 `FOR UPDATE SKIP LOCKED` 認領，舊容器搶到就會用舊程式碼處理，因新欄位是 nullable，舊程式碼的 INSERT 不會報錯，只會靜默留空——沒有任何錯誤訊息，肉眼從結果完全看不出「這是哪個版本處理的」）。
- 影響範圍：任何**部署後立刻**對 Worker 處理的功能做正式站驗證，都可能撞上這個交接期窗口，得到「看似失敗、實則只是舊容器處理」的偽陽性結果；反之也可能有「看似成功、實則邏輯早已改壞但因為是舊容器處理才矇混過關」的偽陰性風險（本案沒發生，但邏輯上存在）。
- 未來避免／規則調整：**Worker 相關功能的正式站端到端驗證，若第一次結果不如預期，先懷疑是否為部署交接期競態，跑第二次驗證（間隔數分鐘）再下結論**，不要在還沒排除這個可能性前就急著回頭改程式碼——本案若當下就去查程式碼會找不到問題（程式碼本身是對的）。更嚴謹的作法：**部署驗證時，`RUNNING` 狀態出現後，等待一段緩衝時間（建議 2–3 分鐘）再開始跑功能驗證**，或至少把「結果不一致就重跑一次確認」列為 Worker 功能驗證的標準動作，寫入未來的部署驗證流程。
- 與既有規則的關係：這是 KB-025「不能只看 `RUNNING`／200 就結案，要跑真實功能驗證」的進一步延伸——本案證明**跑了真實功能驗證都還不夠**，時機也很重要，`RUNNING` 狀態本身在 Worker 場景下可能有數分鐘的交接模糊期。

## KB-029 Postgres 內建全文檢索（tsvector）對中文完全不斷詞，改用 pg_trgm
- 類型：技術發現（Sprint 13，2026-07-19，實作檢索函式時發現）
- 內容：E4-F1 原規劃用 Postgres 內建全文檢索（`to_tsvector('simple', content)` 生成 tsvector 欄位＋GIN 索引），比照上游技術選型「FTS+pgvector 混合檢索」的 FTS 半段。實作前先寫探測腳本實測，結果：`to_tsvector('simple', ...)` 對中文完全不斷詞——一整段被標點符號分隔的中文文字會變成**單一詞元**（如「在各大小醫療院所跑了好幾趟的病人」整句是一個詞元），查詢子字串（如「病人」）用 `plainto_tsquery` 比對**永遠比對不到**，因為 FTS 是詞元相等比對，不是子字串比對。Postgres 標準文字搜尋設定檔（`simple`／`english`）皆無中文斷詞能力，需要額外的中文分詞擴充套件（如 `zhparser`，非 Supabase 標準可用擴充清單）。
- 已完成處置：改用 `pg_trgm`（Supabase 已可直接 `CREATE EXTENSION`，實測確認可用）搭配 `ILIKE '%query%'` 子字串比對＋trigram GIN 索引（`gin_trgm_ops`）加速查詢。`pg_trgm` 的 `%` 相似度運算子本身也不適合本情境（設計給「兩個短字串是否相似」，不是「短查詢字串是否為長文件的子字串」，實測短查詢對長文的相似度分數極低、達不到預設門檻），最終採最簡單直接的 `ILIKE` 子字串比對，trigram 索引只用來加速、不用來算相似度分數。
- 影響範圍：任何未來要對中文內容做「全文檢索」的功能，都不能直接套用 Postgres 內建 FTS API（`to_tsvector`／`to_tsquery`／`plainto_tsquery`）並預期它像英文一樣可用，會得到「看似成功執行、實際上永遠查不到東西」的靜默失效，不會報錯，容易被忽略。
- 未來避免：任何依賴資料庫原生全文檢索能力的功能，若目標語言是中文（或其他無空白分詞的語言），開工前應先用探測腳本對實際目標語言內容做端到端實測（seed→query→驗證有回傳結果），不能只看文件說「支援全文檢索」就假設對中文也適用——這與 KB-024（pdfjs 合併行為）、KB-025（部署驗證不能只看狀態）同一類教訓：外部工具/函式庫的能力邊界要用真實資料實測過才能信任，不能望文生義。

## KB-030 合成測試資料若寫進「與正式知識庫共用」的資料庫，一旦標記為 active 就有被誤當真實證據引用的風險
- 類型：實作中架構修正（Sprint 14，2026-07-19，撰寫 seed script 前重新評估發現）
- 內容：Sprint 14 DOR 草案原規劃另立一支 `scripts/seed-evidence-claims.ts`，仿照 E4-F1 `seed-knowledge-sources.ts` 的模式，寫入一組合成的「咖啡與骨質疏鬆」衝突情境示範資料（上游 §29 現成 Gherkin 範例），以驗證 `evidence_claims` 資料模型與 `getClaimsForTopic()` 查詢邏輯。動筆前重新檢視發現關鍵差異：E4-F1 的 seed 內容雖也需要謹慎處理，但至少是**真實**書籍內容（僅轉錄品質未經最終校對，故標記 `draft`）；而本輪若要示範「衝突」，勢必要編出**虛構的研究名稱與研究發現**（如「统合分析」「世代研究」的具體數字與結論）才能呈現兩個方向不同的主張。若把這類純屬測試示範用途的虛構內容以 `status=active` 寫入與正式站共用的同一個資料庫，未來 E4-F3（AI 串流問答）上線後，`getClaimsForTopic()` 的安全閘門（僅回傳 active 來源）反而會讓這些**假研究被當成通過閘門的合格證據**，有被 AI 引用回答真實使用者健康問題的風險——這是比 draft 閘門更根本的問題：閘門本身沒有錯，錯的是不該讓虛構內容進入閘門判定範圍。
- 已完成處置：取消獨立 seed script，改為衝突情境示範資料只在單元測試檔（`tests/unit/evidence-claims-service.test.ts`）內建立、測試結束立即刪除，比照 `knowledge-service.test.ts` 既有的 `insertSource` 暫時性資料模式（`kst-` 前綴）延伸為 `ecl-` 前綴。確保虛構的示範性醫學內容任何時候都不會留在資料庫中，不論本機或正式站。
- 影響範圍：未來任何 Sprint 若要「示範」或「測試」某個資料表在特定業務情境下的行為，且該資料表的內容會被下游功能（尤其是 AI 問答／使用者可見輸出）視為可信來源，都必須先問：這筆示範資料如果不小心留在正式站資料庫、且被標記為可用狀態，會不會被誤當真的？若會，示範資料只能活在測試檔案的建立／刪除生命週期內，不能透過會寫入正式站共用資料庫的 seed script 產生。
- 與既有規則的關係：延伸自 E4-F1 A55／KB-029 系列一貫原則「內容品質有疑慮時寧可誠實地不完整，不可為了展示功能而降低把關」，本次是同一原則在「虛構 vs. 真實但未校對」這個更細緻的分野上的具體應用。

## KB-031 手動編輯 `.env` 補新變數時，容易漏改 `.env.example` 遺留的註解符號，導致 dotenv 靜默讀不到值
- 類型：操作疏失／流程提醒（Sprint 15，2026-07-19，實作階段發現）
- 內容：`.env.example` 對尚未啟用的功能一律以 `# KEY=` 註解格式佔位（如 E4-F3 的 `# OPENAI_API_KEY=`）。PO 依此格式在本機 `.env` 貼上真實金鑰時，若只是在 `=` 後面貼上值、忘記把行首的 `# ` 也一併刪除，該行在 `.env` 檔案裡仍是註解，`dotenv` 會直接跳過、不會報錯——`process.env.OPENAI_API_KEY` 靜默維持 `undefined`，症狀與「完全沒寫」一模一樣，唯一差異只有檔案裡有沒有那一行字。本次透過既有的安全檢查方式（`grep -c "^OPENAI_API_KEY"` 回傳 0、`grep -c "OPENAI_API_KEY"` 回傳 1，兩者不一致）判斷出問題所在，全程未印出金鑰內容；修正方式為用 `sed -i '<行號>s/^# //' .env` 精準移除該行行首的註解符號，同樣未印出內容。
- 已完成處置：以腳本移除多餘的 `# ` 後，重新以布林值/長度/前綴格式（`sk-` 開頭）確認金鑰正確載入，未印出金鑰內容本身。
- 影響範圍：任何專案只要用「`.env.example` 裡放註解掉的佔位行」這種常見慣例，PO 或協作者依樣填值時都可能複製到這個陷阱；`dotenv` 對格式錯誤的行為是靜默忽略，不是報錯，容易被誤判為「金鑰無效」或「服務本身有問題」而繞了遠路才找到真因。
- 未來避免：往後只要遇到「明明已經設定卻讀不到環境變數」的狀況，第一步就該用 `grep -c "^KEY_NAME"` 與 `grep -c "KEY_NAME"` 兩個計數是否一致來快速排除「行首還留著 `#`」這個最常見成因，再往其他方向（.env 路徑不對、程式沒呼叫 dotenv/config、變數名稱打錯）排查——這與 KB-015（PowerShell 讀 `.env` 需注意編碼）同屬「`.env` 讀取表面正常、實際靜默失效」的同一類教訓，皆全程未印出機密內容即完成診斷。

## KB-032 新增四層鏈模組時，「找不到資源」的存取判斷務必分兩段，不可 collapse 成單一 null

- 類型：實作缺陷／設計慣例提醒（Sprint 17，2026-07-19，測試階段當場抓到）
- 內容：E5-F1 首版 `findOwnedPlan()` 為求精簡，把「呼叫者不擁有此專案」與「plan 在此專案下不存在」兩種情境都寫成同一個 `return null`，呼叫端因此只能統一回 `NOT_FOUND`，跨帳號存取測試（AC-8）因此收到 `{ code: "NOT_FOUND" }` 而非預期的 `{ code: "PROJECT_ACCESS_DENIED" }`，整合測試當場失敗。
- 根因：`observations` 模組既有的 `findOwnedObservation()` 其實早就是「先呼叫 `findOwnedProject()` 判斷第 1／2／4 層（非擁有者回 `PROJECT_ACCESS_DENIED`），再查詢子資源是否存在於該 project（否則回 `NOT_FOUND`）」的兩段式設計，本輪撰寫新模組時沒有把這個既有慣例讀仔細，直接用了 `conversations` 模組 `findOwnedConversation()` 回傳單一 `null` 的簡化寫法（該處之所以能用單一 null，是因為呼叫端額外自己先呼叫過一次 `findOwnedProject()` 判斷 `PROJECT_ACCESS_DENIED`，兩處合看才等價於兩段式；本輪服務層沒有比照那個額外呼叫，才漏了這一段）。
- 已完成處置：把 `findOwnedPlan()` 回傳型別改為 `{ok:true, plan} | {ok:false, code:"PROJECT_ACCESS_DENIED"} | {ok:false, code:"NOT_FOUND"}`，比照 `findOwnedObservation()` 的兩段式判斷，所有呼叫點同步更新為 `const found = await findOwnedPlan(...); if (!found.ok) return found;`。修正後 AC-8 測試通過。
- 影響範圍：任何未來新增的「四層鏈第 3 層子資源查找」helper（如 E5-F2 的 check-ins／symptom_events、E5-F3 的 plan_reviews）都適用同一原則——複製既有 helper 當範本時，優先參照 `findOwnedObservation()` 的兩段式寫法，而非 `findOwnedConversation()` 的單一 null 寫法（後者只在呼叫端有額外把關時才安全，容易被誤以為是通用範本）。
- 未來避免：新增子資源存取 helper 時，測試優先寫「跨帳號存取應得到 `PROJECT_ACCESS_DENIED`」與「同帳號但資源不存在應得到 `NOT_FOUND`」兩條分開的斷言（而非只驗證 `ok:false`），這類錯誤在型別層面不會被抓到（兩者都是合法的 `{ok:false}` 聯集成員），只有跑實際案例才會現形——本次正是測試先寫好兩種情境的明確斷言，才在實作階段就攔下這個缺陷。

## KB-033 惡意檔案掃描補上：VirusTotal API＋雜湊快取優先查詢

- 類型：架構決策＋實作紀錄（Sprint 24，2026-07-22，E6-F2，A142）
- 內容：KB-021 缺口本輪補上，選用 VirusTotal API（免費額度）而非自架 ClamAV，理由與 KB-022 一致的「用最低成本解法對應威脅模型」精神——本專案至今所有外部服務皆走受管 API 路線，不自架基礎設施。實作重點：先以檔案 SHA256 呼叫 `GET /files/{hash}` 查既有分析快取（EICAR 等常見測試樣本幾乎必中，不需等待新分析），未命中才呼叫 `POST /files` 上傳並輪詢 `GET /analyses/{id}` 直到 `status="completed"`。`completeUpload()` 於內容格式驗證通過、寫入正式 Storage 物件**之前**插入此步驟，判定為惡意（`stats.malicious>0` 或 `stats.suspicious>0`）或掃描本身逾時／出錯，一律 fail closed 轉 `upload_failed`，絕不在掃描不可用時靜默放行。
- **真實缺陷發現與修正（同輪 P0 e2e 驗證中）**：原訂輪詢預算 `POLL_MAX_ATTEMPTS=10`（約 30 秒）＋外層 `SCAN_TIMEOUT_MS=45_000`，是憑印象假設訂出、未經真實 API 驗證的數字。本機用真實 VirusTotal API 對一份從未被掃過的全新合法檔案完整測試，實測完整跑完 70+ 引擎需要 **39 秒**，超出原訂預算，導致合法檔案被 fail closed 誤判為 `FILE_SCAN_FAILED`（這是設計本身正確運作、但預算抓太緊的參數問題，非邏輯錯誤）。修正為 `POLL_MAX_ATTEMPTS=35`（約 105 秒）＋`SCAN_TIMEOUT_MS=120_000`（`src/adapters/virustotal/virustotal-scan-adapter.ts`／`src/modules/documents/service.ts`）。本機重測 30.7 秒完成；正式站對另一份全新檔案重測 19.5 秒完成（皆遠低於修正後的 120 秒外層預算）。
- 已完成處置：`src/adapters/scan-adapter.ts`（介面）＋`src/adapters/virustotal/virustotal-scan-adapter.ts`（實作，`isClean(body): Promise<boolean>`，錯誤一律拋例外交呼叫端 fail closed）；`src/modules/documents/index.ts` 新增 `getScanAdapter()` 組裝點（`VIRUSTOTAL_API_KEY` 環境變數）。單元測試以 mock fetch 驗證雜湊快取命中／未命中上傳輪詢／逾時／API 錯誤四種情境（`tests/unit/virustotal-scan-adapter.test.ts`），另於 `documents-service.test.ts` 補上 `completeUpload()` 串接掃描層後的惡意判定／掃描失敗兩條整合測試。
- 影響範圍：`DocumentErrorCode` 新增 `MALICIOUS_FILE_DETECTED`／`FILE_SCAN_FAILED` 兩種錯誤碼；`completeUpload()` 簽名新增 `scan: ScanAdapter` 參數，既有呼叫端（API 路由與全部既有測試檔）皆已同步更新。
- 未來避免：`VIRUSTOTAL_API_KEY` 需要 PO 自行至 https://www.virustotal.com/gui/join-us 申請免費帳號取得（見 KNOWN_ISSUES.md）；正式上線前應實測真實流量是否超出免費額度上限。**外部服務的逾時／輪詢預算，只要有可能，一律用真實 API 對真實情境（尤其是「從未被處理過的全新輸入」這種最慢路徑）實測後才拍板，不要憑經驗或文件敘述估算**——本次差了近 3 倍（30 秒估算 vs 39 秒實測），差距足以讓 fail-closed 設計反過來誤傷合法使用者。

## KB-034 Docker daemon 啟動異常時的隔離資料庫替代方案：pglite（WASM 版 PostgreSQL）

- 類型：工具技巧（Sprint 24，2026-07-22，E6-F2 migration rehearsal 演練時發現）
- 內容：E6-F2 A144 要求 migration／rollback rehearsal 在與正式站完全隔離的環境執行（`db:rollback` 會 `DROP` 資料表，絕不可對正式站共用資料庫演練）。原計畫用 `docker run postgres:16`，但本機 Docker Desktop 啟動異常（daemon 持續無回應，等待數分鐘未見改善），改用 `@electric-sql/pglite`（真實 PostgreSQL 引擎編譯為 WASM，`drizzle-orm` 原生支援其 driver 與 migrator）——完全不需背景服務／daemon，`new PGlite()` 即為一個乾淨的一次性 Postgres 實例，用完即棄。
- 已知限制：pglite 未內建 `pgvector` 擴充（本專案 `CREATE EXTENSION vector` 僅為 E4-F1 預留、至今無任何欄位實際使用 vector 型別，見 A54，故略過不影響驗證真實性）；`pg_trgm`（KB-029 實際使用中）則可透過 `@electric-sql/pglite/contrib/pg_trgm` 匯入模組於建構時載入，正常運作。
- 已完成處置：以自寫的簡易 SQL 語句執行器（依 `--> statement-breakpoint` 或分號換行分句，略過 vector 擴充語句）依序套用全部 16 筆 migration（成功建立 28 張表）、再依序套用全部 down migration（成功回滾至 0 張業務表），完整驗證本專案 migration 鏈路可乾淨雙向。
- 未來避免：往後任何需要「一次性、拋棄式、與正式站完全隔離」的 PostgreSQL 測試環境（例如未來 Sprint 的 migration 演練），優先評估 `pglite` 而非 Docker——後者依賴本機 daemon 可用性，前者是純 Node 套件、零外部依賴、啟動即用。`@electric-sql/pglite` 已留在 `devDependencies`。

## KB-035 Supabase 免費方案完全沒有自動備份，也不提供 PITR（查證結果）

- 類型：查證結果／已知限制（Sprint 24，2026-07-22，E6-F2 A145）
- 內容：docs/runbook.md 先前寫著「回滾前必須先確認備份（Supabase 每日備份＋PITR 依方案）」，本輪依 A145 要求查證 Supabase 官方文件後發現：**免費方案完全沒有自動每日備份**（官方建議免費方案使用者自行定期用 Supabase CLI `db dump` 匯出），**PITR 在任何方案都需額外付費加購**（Pro 方案起，加購價格約每月 100～400 美元不等，依保留天數）。本專案 Supabase 為免費方案，代表 runbook 先前這句話對本專案而言是不準確的——目前正式站資料庫沒有平台層級的還原安全網。
- 已完成處置：docs/runbook.md 已更正為誠實描述現況，並建議正式資料量變大前優先評估「新增修正 migration」而非「回滾」，或升級方案／建立手動備份排程；KNOWN_ISSUES.md 已將此列為上線前應處理事項第 2 條。
- 未來避免：任何涉及「這個平台服務有沒有備份／還原能力」的文件敘述，都應該實際查證官方文件對「目前實際使用的方案層級」的說明，不能用該平台付費方案的能力去描述免費方案（兩者常有巨大落差，這正是本次踩到的坑）。

## KB-036 「永久刪除」帳號未刪 Supabase Auth 身分，導致原帳密仍可登入且本地列會復活

- 類型：真實缺陷（Sprint 23，2026-07-22，E6-F1 正式站部署驗證時發現，commit `a99368a`）
- 內容：`permanentlyDeleteAccount()` 初版只刪除本地 `users` 資料列，未同步刪除 Supabase Auth 端的帳密身分。正式站部署驗證時實測「永久刪除」流程跑完後，用同一組帳密仍可成功登入——且因既有登入流程的 `syncUserVerification()` upsert 邏輯會在偵測到 Auth 身分存在但本地列缺失時自動補回，本地 `users` 列因此在下次登入時「復活」，永久刪除形同沒有發生。本機測試（Fake adapter）完全沒發現，因為 Fake 的假 Auth adapter 本來就不會真的擋登入。
- 已完成處置：`AuthAdapter` 介面新增 `deleteUser(userId): Promise<void>`（`src/adapters/auth-adapter.ts`），`SupabaseAuthAdapter` 實作呼叫 `admin.auth.admin.deleteUser(userId)`（`src/adapters/supabase-auth/supabase-auth-adapter.ts`；實測對本專案的新版不透明格式 `service_role` key 正常運作，不受 `getUserById()` 已知限制影響，見 KB-009／KB-012）；`permanentlyDeleteAccount()` 修正為**先呼叫 `auth.deleteUser()`、成功後才刪除本地 `users` 列**（`src/modules/account/deletion.ts`），確保重試安全且不會出現「Auth 已刪、本地列還在」或反過來的不一致中間態。修正後於正式站以真實 Worker 完整驗證三輪帳號永久刪除生命週期，關鍵驗證點是「刪除後重新登入應失敗」，實測回應 401 `AUTH_INVALID_CREDENTIALS`，確認 Auth 身分已真正移除。
- 影響範圍：僅 `permanentlyDeleteAccount()` 到期執行永久刪除的路徑；三十日冷靜期申請／撤銷本身不受影響。此缺陷修正後部署，worker 隨即因缺少 `SUPABASE_ANON_KEY` 環境變數（`getAuthAdapter()` 建構 adapter 需要，worker 過去只設定 Storage 用得到的變數）導致全數工作失敗，屬 KB-025 記載的同類型缺口，已比照處置補上變數並重啟。
- 未來避免：任何「刪除／停用使用者」的功能，只要系統同時存在**本地資料表**與**外部身分驗證服務**兩份使用者紀錄，就必須明確設計兩者的刪除順序與失敗回滾策略，並在測試中至少對真實（或高保真）Auth 服務跑一次端到端「刪除後應無法再登入」的驗證——純 Fake adapter 的單元測試無法揭露這類「本地狀態已清但外部身分仍存活」的缺口，這正是本專案 KB-025／KB-028 已多次強調「部署驗證不能只看服務 RUNNING，需真實功能驗證」原則的又一實例。

## KB-037 公開站 OG 分享卡片：og:image 缺乏素材時的處置，以及本機開發環境無法驗證真實 LINE／Messenger 卡片外觀

- 類型：範圍限縮＋測試方法限制記錄（Sprint 25，2026-08-05，E7-F1，A151）
- 內容：`14_PUBLIC_SITE_COPY.md` 頁 4 建議 Hero 頁 OG 卡片放一張「安靜、非行銷感的靜態圖」，但專案當下無任何此類圖片素材。PO 確認本輪不生成占位圖，僅完成 `og:title`／`og:description`（已用瀏覽器 `document.querySelector('meta[property="og:title|og:description"]')` 實測正確輸出，字數分別 26／45 字，皆在文案檔建議上限內）。連動地，15_HANDOFF_PUBLIC_SITE.md 要求的「LINE／Messenger 貼連結實測分享預覽卡片」本輪**未能完整驗證**——本機開發環境（`localhost:3000`）沒有可公開存取的網址，LINE／Messenger 等外部服務無法對其抓取 OG meta 產生真實預覽卡片，這類驗證天生需要一個公開網址才能進行，不是本機測試方法可以補足的缺口。
- 已完成處置：`og:title`／`og:description` 已在 `src/app/page.tsx` 的 `metadata` 匯出中實作並於本機瀏覽器渲染結果核對正確；`og:image` 欄位留白未設定（非設為空字串或假連結）。**PO 2026-08-05 追認 A151，並明確要求 `og:image` 列為正式站部署後的近期待辦，不要拖到下次大改版才補**——已同步列入 `KNOWN_ISSUES.md` 第 9 項。
- 影響範圍：正式站部署後，需另外用瀏覽器直接對 `health-devkit.zeabur.app` 貼上真實 LINE／Messenger 連結，或用第三方 OG 除錯工具（如 Facebook Sharing Debugger／opengraph.xyz 之類公開服務——注意這類工具會把公開網址送到第三方服務，本身不含機密或健康資料，風險可接受）驗證卡片外觀，才算完成 15_HANDOFF 該項 DOD；PO 之後提供 `og:image` 圖片素材時，只需在同一個 `metadata.openGraph` 物件補上 `images` 欄位，不需改動其餘結構。
- 未來避免：任何「需要外部服務（社群平台、webhook、第三方爬蟲）抓取本站公開網址」才能完整驗證的需求，本機開發環境結構性地無法驗證到最後一哩路，DOR／DOD 撰寫時應如實區分「本機可驗證的部分」（meta tag 格式、字數）與「需部署後才可驗證的部分」（外部服務實際抓取結果），不要讓兩者的驗收條件混在一起、造成「測試通過」但實際上只驗證了一半的錯覺——此原則與 KB-025／KB-028 一貫強調「部署驗證不能只看表面訊號」同源，差別在於這次連「看表面訊號」都做不到，必須誠實標記為「待正式站部署後補驗證」。

### 正式站部署後補驗證結果（2026-08-05，commit `c8d7eb0` 部署完成後）

- **部署確認**：`npx zeabur@latest deployment list` 確認 web service 最新部署（`c8d7eb0`）狀態轉 `RUNNING`；`/api/health` 回 200 `{"status":"ok"}`；依 KB-025 教訓不僅看這兩者就結案，另用真實瀏覽器對正式站真實網域（`health-devkit.zeabur.app`）逐一開啟五個新公開頁面（`/`、`/privacy`、`/scope`、`/about`、`/ai-principles`），`get_page_text` 核對內容與本機驗證結果一致，皆無異常。
- **og meta 實測**：於正式站 Hero 頁用 `document.querySelector('meta[property="og:title"]'/'og:description')` 讀取，確認正式站輸出與程式碼一致——`og:title`「個人健康檢查管理平台｜把健檢報告變成看得懂的健康紀錄」（26 字）、`og:description`「整理歷年健檢資料、追蹤長期趨勢、建立可以安心調整的健康行動計畫。不診斷、不開藥、不用命理。」（45 字），`og:image` 確認不存在（符合 A151 預期，非缺陷）。
- **第三方 OG 卡片驗證方式說明**：本機瀏覽器工具沒有 LINE／Messenger 客戶端可以真的貼連結測試，改用公開的第三方 OG 除錯工具 `opengraph.xyz` 對正式站網址（`https://health-devkit.zeabur.app/`）掃描——這類工具的運作原理與 LINE／Messenger 抓取連結預覽時相同（讀取目標網頁的 `og:*` meta tag 產生卡片），故可視為對「分享卡片是否正常顯示」的可信同等驗證，但誠實記錄：**並非直接在 LINE 或 Messenger 應用程式內實際貼上連結測試**，仍與「真的在 LINE 裡貼連結看到的畫面」存在工具鏈上的細微差異（例如各平台快取策略、圖片比例裁切規則不完全相同），若日後需要更高保真度的驗證，需 PO 或維護者直接在 LINE／Messenger 裡貼一次正式站連結核對。
- **opengraph.xyz 掃描結果**：`og:title` 正確解析、26 字，在其建議上限（60 字）內，**無截斷**；`og:description` 正確解析、45 字，在其建議上限（120–160 字）內，**無截斷**；`og:image`／`twitter:image` 皆回報缺失（`Image is missing`），與 A151 預期一致，非本次發現的新缺陷；額外提示 `og:site_name` 也缺少（文案檔與 15_HANDOFF 皆未要求此欄位，非本輪範圍，未處理）。
- **結論**：Hero 頁的 OG 分享卡片標題與描述在正式站環境下會正確顯示、不會截斷；卡片會因缺 `og:image` 而退回純文字或 favicon 樣式的卡片（非破圖或空白），使用者體驗上是「陽春但正確」而非「壞掉」。**PO 已確認 `og:image` 列為正式站部署後的近期待辦**（非下次大改版才處理，見 KNOWN_ISSUES.md 第 9 項），待提供圖片素材後於 `src/app/page.tsx` 的 `metadata.openGraph` 補上 `images` 欄位即可。

## 新紀錄模板
（依方法論 13.2 節）
