# Sprint 21 DOR — E1-F3：Google 登入與帳號連結模組

> 狀態：**草案，待 PO 確認 A121–A127 並通過 DOR**
> 對應：E1-F3（05_BACKLOG E1 表，🟡 風險，精估 1 個 Sprint，外部依賴：Google OAuth 憑證）；SDD §4.1；上游規格 §5.1／§7.1／§17／§22.1／§23／§24／§28.1／Stage 1；憲法 §1（外部服務經 adapter）／§4（憑證不落地）
> 前置依賴：E1-F2（帳號生命週期）✅ 已完成；E1-F5（個人健康背景）✅ 已完成（因故排序提前，見 05_BACKLOG）
> 建議 Sprint 順序（05_BACKLOG）：……E5-F3（已完成）→ **E1-F3（本輪）** → E5-F4 → E6-F1 → E6-F2

---

## 0. ⚠️ 外部依賴阻塞提醒（開工前請 PO 確認）

`.env.example` 已保留 `GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET` 佔位符但**尚未設定**（10_SYNC.md 記錄「Google OAuth（E1-F3 前）後補」）。本輪架構決定沿用 Supabase Auth 內建 OAuth 代理（見 A121），因此**真正需要 PO 準備的是**：

1. Google Cloud Console 建立 OAuth 用戶端（類型：Web application），Authorized redirect URI 填入 Supabase 提供的回呼網址（格式固定為 `https://<專案>.supabase.co/auth/v1/callback`，PO 可在 Supabase Dashboard → Authentication → Providers → Google 頁面直接複製）
2. 將取得的 Client ID／Client Secret 貼入 Supabase Dashboard 的 Google Provider 設定並啟用
3. 確認 Supabase Dashboard「Allow linking accounts with the same verified email」設定為啟用（滿足上游 §28.1「同一已驗證 Email 不無提示建立兩個帳號」的硬性規則，見 A121）

這三步都在 Supabase／Google 後台完成，**不需要寫入本專案的 `.env` 或 Zeabur 變數**（見 A121 說明）。DOR 可先通過、程式碼與測試可先開工，但**真實 Google 帳號端到端瀏覽器驗證**（正式站部署驗證的必要步驟）需等 PO 完成上述設定後才能進行——比照 E4-F3（LLM API key）先例，此為開工後、正式站部署驗證前的阻塞項，非開工本身的阻塞項。

---

## 1. 需求描述

**範圍定位**：E1-F2 已完成 Email／密碼註冊登入的完整生命週期（本專案憑證不落地，交由 Supabase Auth 管理，見既有 A7/A9）。E1-F3 補上第二種登入方式——Google 登入，並確保「用 Google 登入的使用者」與「先前用 Email／密碼註冊、之後改用 Google 登入同一 Email」不會產生重複帳號（上游 §28.1）。

三項交付：

1. **`AuthAdapter` 介面擴充**（`src/adapters/auth-adapter.ts`）：新增 `verifyGoogleToken(accessToken: string): Promise<{userId, email, emailVerified} | "AUTH_GOOGLE_FAILED">` 方法。`SupabaseAuthAdapter` 實作改用 `anon.auth.getUser(accessToken)`（**非** Admin API——本專案 service_role 為新版不透明金鑰格式，已知在 KB-009／KB-012 記錄為 Admin API 呼叫失敗，`getUserById()` 因此擱置未接線，見 A124）。
2. **服務層擴充**（`src/modules/auth/service.ts`）：新增 `loginWithGoogle(input: {accessToken, agreeTermsAndDisclaimer?, declareAge18?}): Promise<LoginResult | RegisterResult 的聯集>`——驗證 token 成功後，若本地 `users` 表已有該 id（既有帳號）→ 比照既有 `login()` 建立 session；若本地無此 id（首次使用 Google）→ 要求前端已隨請求附上同意條款勾選（A125），成功則寫入 `users`＋`consent_records`（沿用既有 `CONSENT_VERSION`）＋建立 session；任何一步失敗一律回 `AUTH_GOOGLE_FAILED`，不寫入任何列（上游 §28.1「Google 失敗不建立半完成帳號」，A123）。
3. **API 路由與 UI**：
   ```
   POST /api/auth/google
   ```
   請求體：`{ accessToken: string, agreeTermsAndDisclaimer?: boolean, declareAge18?: boolean }`；回應與既有 `/api/auth/login` 相同結構（`{status, emailVerified}` ＋ session cookie）。前端新增 `/auth/callback` 頁面（監聽 Supabase `onAuthStateChange`／`getSession()` 取得 `access_token` 後 POST 至本端點，成功後導向 `/projects`，並比照既有密碼流程立即捨棄 Supabase 瀏覽器端 session，`signOut({scope:"local"})`，讓本系統自有 session 成為唯一真相來源）。登入頁與註冊頁新增「使用 Google 登入」按鈕（呼叫 `supabase.auth.signInWithOAuth({provider:"google", options:{redirectTo}})`），細節見 A125。

## 2. 使用者角色

- 新使用者：從未在本系統註冊過，直接用 Google 帳號登入建立新帳號。
- 既有使用者：先前用 Email／密碼註冊過（Email 已驗證或未驗證皆可能），改用相同 Google 帳號的 Email 登入，應接續同一帳號而非建立新帳號。

## 3. 操作流程

使用者於登入頁或註冊頁點擊「使用 Google 登入」→ 導向 Google 帳號選擇與同意畫面 → 完成後導回本站 `/auth/callback` → 前端取得 Supabase 核發的 access_token，POST 至 `/api/auth/google` → 後端驗證 token 並依「是否為新帳號」分流（新帳號需已隨請求附上同意條款勾選，否則拒絕並導回註冊頁完成同意）→ 成功後建立本系統 session，導向 `/projects`。

## 4. 輸入資料

| 輸入 | 來源 | 狀態 |
|---|---|---|
| Google 帳號同意結果（access_token） | Supabase Auth OAuth 代理（瀏覽器端取得） | 待伺服器驗證真偽 |
| 同意條款勾選（首次使用 Google 時） | 使用者於註冊頁勾選 | 沿用既有 `agreeTermsAndDisclaimer`／`declareAge18` 欄位與驗證邏輯 |
| 既有 `users`／`sessions`／`consent_records` 表結構 | E1-F2 已完成 | ✅ 已完成，本輪不新增欄位，沿用既有 schema |

## 5. 輸出結果

§1 三項交付；完成後使用者可用 Google 帳號登入或註冊，且與既有 Email／密碼帳號共用同一使用者身分（同一 Email 不產生重複帳號），登入後的 session／權限鏈與既有 Email／密碼登入完全一致（沿用 `createSession()`，四層權限鏈不受影響）。

## 6. 驗收條件（Given／When／Then，草案，待 PO 確認）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（首次 Google 登入，建立新帳號） | 從未用此 Google 帳號的 Email 登入過本系統，已勾選同意條款 | 完成 Google OAuth 流程並 POST `/api/auth/google` | 成功建立 `users`＋`consent_records`＋`sessions`，回應含 session cookie |
| AC-2（首次 Google 登入，未同意條款） | 同上但未勾選同意條款 | POST `/api/auth/google` | 拒絕（`CONSENT_REQUIRED`），不寫入 `users`／`sessions` |
| AC-3（既有帳號改用 Google 登入） | Email 已存在本地 `users`（先前 Email／密碼註冊過） | 用相同 Email 的 Google 帳號登入 | 成功登入同一 `userId`，不產生第二筆 `users` 列 |
| AC-4（Google token 驗證失敗） | 偽造、過期或無效的 `accessToken` | POST `/api/auth/google` | 回 `AUTH_GOOGLE_FAILED`（401），不寫入任何資料 |
| AC-5（session 一致性） | Google 登入成功 | 呼叫既有 `GET /api/auth/me` | 回傳結構與 Email／密碼登入完全相同 |
| AC-6（登出，回歸確認） | 已用 Google 登入建立 session | 呼叫既有 `POST /api/auth/logout` | 正確撤銷，沿用既有 `revokeSession()`，無需新邏輯 |
| AC-7（日誌 P0） | 建立／驗證 Google 登入全流程 | 掃描日誌 | 不含 `accessToken`／Email（比照既有註冊「email 不入日誌」慣例） |
| AC-8（UI） | 登入頁與註冊頁 | 檢視頁面 | 皆顯示「使用 Google 登入」按鈕；點擊後正確導向 Google 帳號選擇畫面 |

**本輪 AC 範圍排除**：自訂帳號合併介面（依賴 Supabase 自動連結，非本系統自製流程）、其他 OAuth 供應商（Facebook／Apple 等）、帳號刪除鏈調整（E6-F1 範圍）。

## 7. Clarify 釐清

無新增 Clarify；本輪高不確定性項目以假設方式登記（A121–A127），待 PO 於通過 DOR 時一併追認。**唯一需要 PO 額外行動的項目是 §0 所列 Supabase／Google 後台設定**，非程式碼層級的 Clarify。

## 8. 可能影響的舊功能

- `AuthAdapter` 介面新增一個方法（`verifyGoogleToken`），既有 `register()`／`verifyPassword()`／`sendPasswordReset()`／`getUserById()` 簽章不變，測試用假實作（test doubles）需補上新方法但不影響既有測試案例
- 登入頁／註冊頁 UI 新增按鈕區塊，既有 Email／密碼表單與既有 E2E 測試流程不變
- `AuthService` 新增 `loginWithGoogle()`，與既有 `register()`／`login()` 平行存在，不修改既有方法邏輯

## 9. 一個 Sprint 內可完成

05_BACKLOG 精估 1 個 Sprint、風險 🟡（非 PoC）。範圍為一個 adapter 方法＋一個服務層方法＋一個 API 端點＋一個 callback 頁面＋兩個既有頁面加按鈕，複雜度低於 E5-F1／E5-F3。**若實作中發現規模超出預期**（例如 Supabase Admin API 相容性問題比預期複雜），比照既有 PoC 拆分先例——backend＋API＋測試優先出貨，UI 延後，並在 SPRINT_LOG 誠實記錄。**真實 Google 帳號端到端驗證需等 PO 完成 §0 後台設定**，若 Sprint 期間設定尚未就緒，本機/正式站的功能驗證改以「模擬 Supabase token 驗證回應」的整合測試為主，UI 導向流程驗證則需延後至設定完成後補做（誠實記錄於 SPRINT_LOG，不視為本輪未完成）。

## 10. 範圍排除

- **自架 Google OAuth client**（不透過 Supabase 代理）——不符合本專案既有「外部服務經 adapter，憑證不落地」架構慣例，見 A121
- **帳號合併 UI**——依賴 Supabase Dashboard 的自動連結設定（同一已驗證 Email），本系統不自製合併流程或衝突處理介面
- **其他 OAuth 供應商**（Facebook、Apple、LINE 等）——上游規格僅要求 Google
- **修改既有 Email／密碼登入行為**——`login()`／`register()` 不受本輪影響

## 11. 假設登記（待 PO 追認）

- **A121（新增，架構決定）**：Google OAuth 走 **Supabase Auth 內建 OAuth 供應商代理**，而非本系統自架 OAuth client。Google Client ID／Secret 貼在 **Supabase Dashboard**（Authentication → Providers → Google），不進入本專案的 `.env`／Zeabur 環境變數；`.env.example` 既有的 `GOOGLE_CLIENT_ID`／`GOOGLE_CLIENT_SECRET` 佔位符本輪不會被程式碼讀取，予以保留僅供對照文件用途。「同一已驗證 Email 不無提示建立兩個帳號」（上游 §28.1）依賴 Supabase Dashboard「Allow linking accounts with the same verified email」設定，屬後台設定而非本系統程式邏輯。**理由**：延續 E1-F2 既有「憑證不落地、交由 Supabase Auth 管理」架構（A7/A9），避免自架第二套 OAuth 堆疊增加攻擊面與維運成本。
- **A122（新增）**：Google 登入採瀏覽器端 OAuth 導向流程——`supabase.auth.signInWithOAuth()` 導向 Google → 導回本站 `/auth/callback` → 前端取得 `access_token` → POST `/api/auth/google` 交由伺服器驗證並建立本系統自有 session（沿用既有 `createSession()`）→ 立即捨棄 Supabase 瀏覽器端 session（`signOut({scope:"local"})`）。**理由**：比照既有密碼登入「Supabase 端 session 立即捨棄，session 由應用層管理」慣例（A9），避免雙重 session 狀態源。
- **A123（新增，核心安全設計）**：Google 登入任一步驟失敗（token 驗證失敗、新帳號未附同意條款、資料庫寫入失敗）一律回 `AUTH_GOOGLE_FAILED`（新帳號未同意則回 `CONSENT_REQUIRED`），且不寫入 `users`／`consent_records`／`sessions` 任何一列。**理由**：逐字落實上游 §28.1「Google 失敗不建立半完成帳號」的硬性規則。
- **A124（新增，關鍵技術發現）**：伺服器端驗證 Google 核發的 Supabase `access_token` 改用 **`anon.auth.getUser(accessToken)`**（用 anon key 呼叫 Supabase `/auth/v1/user`，帶入使用者自己的 JWT），**不使用** `admin.auth.admin.getUser()`（Admin API）。**理由**：KB-009／KB-012 已記錄本專案的 Supabase service_role 為新版不透明金鑰格式（`sb_secret_...`），該格式目前不被 GoTrue Admin API 接受（實測回 401 `no_authorization`）；`SupabaseAuthAdapter.getUserById()` 因此擱置未接線正是此限制的既有證據。`anon.auth.getUser()` 走一般使用者驗證路徑，不受此限制影響，且是 Supabase 官方文件記載的標準做法。
- **A125（新增，UX 決定）**：「使用 Google 登入」按鈕同時放在登入頁與註冊頁；**僅註冊頁**顯示同意條款勾選框（沿用既有 Email 註冊表單的勾選框，Google 按鈕需勾選後才可點擊）。登入頁的 Google 按鈕**不**顯示同意條款；若使用者在登入頁點擊 Google 登入、但後端判定為全新帳號（本地 `users` 無此 id），回應 `CONSENT_REQUIRED`，前端顯示提示並導向註冊頁完成同意後重新嘗試。**理由**：避免登入頁與註冊頁重複維護兩套同意條款 UI，且符合使用者心智模型（登入頁預期是「我已經有帳號」，真正的新帳號建立集中在註冊頁把關）。
- **A126（新增，外部依賴阻塞提醒）**：Google OAuth 用戶端 ID／密鑰**尚未於 Supabase Dashboard 設定完成**（10_SYNC.md 記錄「後補」），需 PO 於本輪開工後、正式站部署驗證前完成 §0 所列三步設定。DOR 可先通過、程式碼與整合測試（以假 token 驗證回應模擬）可先開工；**真實 Google 帳號的端到端瀏覽器驗證**需等待此設定完成。**理由**：比照 E4-F3（OpenAI API key）先例，外部憑證未就緒不阻擋 DOR 通過與程式碼開工，但阻擋最終「真實資料端到端驗證」（KB-025 要求）。
- **A127（新增）**：Google 核發的 `access_token`／Supabase session token 一律不進日誌，比照既有密碼／API 金鑰不落地原則（憲法 §4）；日誌僅記錄成功／失敗狀態碼，不記錄 Email 或 token 內容本身（沿用既有註冊登入「email 不入日誌」慣例）。

## 12. 三層結構回溯

- Feature：**E1-F3**（E1 平台與信任基座，補齊後為 5/5）
- SDD：§4.1；上游 §5.1／§7.1／§17／§22.1／§23／§24／§28.1／Stage 1；憲法 §1／§4
- 前置依賴：E1-F2 ✅（Sprint 2）

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」不適用（本輪為登入前的身分驗證，尚無專案層級資源）；「日誌掃描」適用（AC-7，範圍為 `accessToken`／Email）；「LLM Streaming」不適用（本輪無 LLM 使用）。**本輪額外要求**：SPRINT_LOG 需誠實記錄「Google OAuth 後台設定完成時機」與「若設定未就緒，正式站部署驗證的實際涵蓋範圍（程式碼／API／模擬測試 vs. 真實 Google 帳號端到端）」，不得因設定delay而在文件上誇大宣稱已完整驗證。
