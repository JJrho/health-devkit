# Sprint 3 DOR — E1-F2：帳號生命週期模組

> 狀態：**✅ 通過（PO 2026-07-12：A7–A10 追認、DOR 通過）**
> 對應：E1-F2（05_BACKLOG E1 表，1 Sprint）；SDD §4.1、§5（公開站）、§10；Clarify C6／C7／C8／C9／C11；憲法 §1／§2／§4／§6
> 前置依賴：E1-F1 ✅（骨架＋部署線）

---

## 1. 需求描述 ✅

Email 帳號全生命週期（Google 登入除外——E1-F3）。六項交付：

1. **DB migration**：`users`（對應 Supabase auth 使用者、email_verified 快照）、`sessions`（7 天滑動，C8/A9）、`login_attempts`（鎖定計數，C7/A8）、`consent_records`（同意版本＋時間戳，C11）。可回滾。
2. **AuthAdapter 的 Supabase 實作**（憲法 §1）：註冊／密碼驗證／Email 驗證／重設信觸發，vendor SDK 只進 adapter 層。
3. **API 路由**：register／login／logout／verify／forgot-password／reset-password，全走統一 error envelope＋request_id＋idempotency（憲法 §4）。
4. **業務規則落地**：
   - C6：未驗證可登入、可建專案（建專案功能在 E1-F4，本輪先落 `email_verified` 判斷閘）；上傳與 AI 於對應 Feature 檢查此閘
   - C7：15 分鐘內失敗 5 次鎖 15 分鐘、累犯翻倍
   - C8：session 7 天滑動效期（HttpOnly cookie），不做記住我
   - C9：重設 token 30 分鐘、單次有效
   - C11：註冊強制勾選條款＋醫療免責聲明（佔位文案，A10）、未滿 18 歲不開放（自我聲明勾選）
5. **UI 頁面**（SDD §5 公開站一部分）：註冊／登入／忘記密碼／重設密碼／驗證提示。高齡優化：大字、高對比、防重複提交；繁中溫和文案（憲法 §6）；WCAG 2.2 AA 鍵盤可操作。
6. **測試**：四類齊備＋TDD 種子「同 Email 再註冊不得無提示建第二帳號」＋日誌無憑證斷言。

## 2. 使用者角色 ✅

**終端使用者（本人）**首次進場（SDD §2）：註冊、登入、驗證、重設。管理者與代理角色不在本輪。

## 3. 操作流程 ✅

註冊（含條款同意＋18 歲聲明）→ 收驗證信 → 點連結完成驗證；登入 → session 7 天滑動 → 登出。忘記密碼 → 重設信 → 30 分鐘內重設。未驗證者可登入但看到驗證提醒（C6）。

## 4. 輸入資料 ✅

| 輸入 | 來源 | 狀態 |
|---|---|---|
| Supabase Auth（東京專案內建） | 已開通 | ✅ |
| SUPABASE_SERVICE_ROLE_KEY／ANON_KEY | PO .env＋Zeabur 變數 | ✅（本機有；Zeabur 於部署驗收時補設） |
| 條款與醫療免責文案 | 正式版需法律審查（E6-F2 硬門檻） | 🔶 本輪用佔位版（A10） |

## 5. 輸出結果 ✅

§1 六項交付；完成後使用者可在 https://health-devkit.zeabur.app 實際註冊登入。

## 6. 驗收條件（Given／When／Then）✅

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | 新 Email＋合規密碼＋勾選條款與 18 歲聲明 | 提交註冊 | 帳號建立、寄驗證信、consent_records 入庫（版本＋時間戳）；未勾任一聲明則拒絕且不建帳號 |
| AC-2 | 已存在之已驗證 Email（TDD 種子） | 以同 Email 再註冊 | 明確提示既有帳號，不得無提示建立第二帳號 |
| AC-3 | 正確憑證 | 登入 | HttpOnly session cookie 建立；7 天滑動效期（活動即延展）；過期後需重新登入 |
| AC-4 | 未驗證帳號（C6） | 登入 | 可登入、顯示驗證提醒；系統可查得 email_verified=false（供後續上傳/AI 閘用） |
| AC-5 | 15 分鐘內密碼錯 5 次（C7） | 第 6 次嘗試 | 鎖定 15 分鐘、回統一錯誤（不洩漏帳號是否存在）；再犯鎖定時間翻倍 |
| AC-6 | 申請密碼重設（C9） | 30 分鐘內用 token 重設 | 成功且 token 失效；逾時 token 或已用 token 一律被拒 |
| AC-7 | 已登入 | 登出 | session 撤銷、cookie 清除、受保護路由不可再訪 |
| AC-8 | 全程 | 掃描日誌＋跑 a11y 檢查 | 日誌無 Email/密碼/token（白名單斷言）；頁面鍵盤可完成全流程；文案繁中溫和 |

## 7. Clarify 釐清 ✅

C6–C9、C11 皆已定案（SDD §17）；無新增未決。

## 8. 可能影響的舊功能 ✅

E1-F1 骨架不得回歸（CI 把關）；`/api` catch-all 需與新 auth 路由共存；`users` 表為後續所有模組的外鍵根，欄位命名依上游 §23（snake_case）。

## 9. 一個 Sprint 內可完成 ✅

Backlog 精估 1 Sprint；Supabase Auth 承擔密碼雜湊與信件寄送，本輪工作集中在規則落地與 UI。

## 10. 範圍排除 ✅

- Google 登入與帳號連結（E1-F3）
- 帳號刪除 30 天冷靜期鏈（C10，E6-F1）
- 個資管理頁（隨 E1-F5 背景模組一併）
- 四層權限鏈與專案 CRUD（E1-F4）
- 自有 SMTP（正式量再接，A7）；條款正式文案與法律審查（E6-F2）
- 「記住我」（C8 明定不做）

## 11. 假設登記（待 PO 追認）

- **A7**：驗證信／重設信由 **Supabase 內建信件服務**寄送。⚠️ 免費方案每小時限額極低（個位數封），開發驗收夠用；正式對外前需接自有 SMTP（記入待辦，不在本輪）。
- **A8**：C7 鎖定計數以自建 `login_attempts` 表實作（Supabase 內建限流規則與 C7 定案值不一致，不足恃）。
- **A9**：C8 的 7 天滑動 session 以**應用層 sessions 表＋HttpOnly cookie** 實作，Supabase 僅作憑證驗證——完全符合 C8 且可測可控；不依賴 Supabase 的 JWT 效期設定。
- **A10**：條款＋醫療免責＋18 歲聲明本輪用**佔位文案**（標記「未經法律審查」），同意紀錄機制（版本欄位）先落地；正式文案換入時 consent 版本遞增即可，不需改結構。

## 12. 三層結構回溯 ✅

- Feature：**E1-F2**（E1 平台與信任基座，2/5）
- SDD：§4.1；§5 公開站；§10 錯誤處理；C6–C9、C11
- 前置依賴：E1-F1 ✅

## 13. DOD 適用性備註

追加三條：「日誌掃描」為本輪 P0（AC-8 憑證斷言）；「四層權限鏈」部分適用（session 驗證是第一層，完整鏈在 E1-F4 驗）；「LLM Streaming」N/A。
