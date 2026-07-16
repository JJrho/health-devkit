# Sprint Log — 個人健康檢查管理平台

> 目前狀態：Sprint 6 ✅ 完成（2026-07-16）——**E2-F1 上傳會話與預覽模組結案（Feature 5/20）**，已 commit（`b2b413f`）＋push＋正式站部署驗證通過。下一個：PO 決定是否開工 E2-F2（PDF 解析管線，本案第一個 🔴 PoC Feature）。

## Sprint 6 — E2-F1：上傳會話與預覽模組 ✅

- 期間：2026-07-15～16（單日跨夜完成實作、驗證、commit、push、正式站部署驗證）
- DOR：✅ 通過（sprints/sprint-06-dor.md；A18–A21 由 PO 追認）
- 目標：StorageAdapter 實作＋`documents` 上傳會話＋C12/C13 業務規則＋四層鏈第 3 層於有獨立 id 巢狀資源上生效 → **達成，已部署正式站**（`https://health-devkit.zeabur.app/api/projects/{id}/documents` 回 401 確認新版上線），範圍明確止於 uploaded 狀態（解析屬 E2-F2）

### 驗收結果（AC-1～AC-11；整合測試＋對真實 Supabase Storage 的 curl／瀏覽器驗證）
| AC | 結果 |
|---|---|
| AC-1／AC-2 | ✅ 整合測試（TDD 種子）：建立會話；同 idempotencyKey 冪等，不建立第二筆 |
| AC-3 | ✅ 整合測試＋真實 Storage 實測：完整流程成功，PDF 內容通過驗證；下載 signed URL 內容與原檔一致（594 bytes，`%PDF` header 正確） |
| AC-4 | ✅ 整合測試：偽造副檔名但內容不符回 `FILE_TYPE_NOT_SUPPORTED`，狀態轉 `upload_failed` |
| AC-5 | ✅ 整合測試：PDF 超過 30 頁、檔案超過 20MB 皆回 `FILE_TOO_LARGE`；另補測「失敗後換檔重試同一會話可成功」 |
| AC-6 | ✅ 整合測試：專案 200 份文件上限，第 201 筆遭拒 |
| AC-7（四層鏈第 3 層，本輪關鍵） | ✅ 整合測試：文件存在專案 A，用專案 B 的 id 一律 `PROJECT_ACCESS_DENIED`，即使 A、B 皆本人所有 |
| AC-8 | ✅ 整合測試＋真實 curl：跨帳號 403＋稽核 log；未驗證帳號建立會話回 `EMAIL_VERIFICATION_REQUIRED`（C6 閘，真實 Supabase 帳號實測） |
| AC-9 | ✅ 整合測試：取消後同 idempotencyKey 可重新上傳成功 |
| AC-10 | ✅ 整合測試＋真實驗證：signed URL 可下載且內容正確；刪除後同一 URL 變 400，確認 Storage 物件真的被移除 |
| AC-11 | ✅ 整合測試＋真實 log 檢查：稽核 log 僅含識別碼，不含檔名 |

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 11 檔／54 test 全綠；`pnpm build` 乾淨過；typecheck／lint 無錯誤
- [x] 肉眼驗收：真實 Supabase Storage 端到端驗證（非僅假 adapter）；UI 列表/預覽/刪除按鈕邏輯以真實資料驗證
- [x] 修正皆反映於規格與文件：SDD §15／SPRINT_LOG／KB-021／SYNC／ROADMAP 已更新；OpenAPI 已補文件系列端點
- [x] 假設 A18–A21 已於 DOR 追認；本輪無新增 A 編號
- [x] 追加 DOD：四層權限鏈第 3 層為本輪 P0（AC-7）；日誌掃描為 P0（AC-11，檔名比 E1-F5 的 `data` 欄位更基本的隱私）；LLM Streaming N/A
- [x] PO 2026-07-16：確認 commit（`b2b413f`）＋push＋正式站部署驗證通過
- [x] 下一步明確：PO 決定是否開工 E2-F2（PDF 解析管線），或先處理 KB-018/KB-020/KB-021

### 本輪工程筆記
- 需要為 `StorageAdapter` 介面新增 `getObject`（讀回分段供 complete 時串接），Sprint 1 定義的介面未預見這個需求，屬正常的介面隨實作演進
- 一次性建立私有 Storage bucket：`scripts/setup-storage.ts`（冪等，可重跑）
- 新增 `pdf-lib` 依賴（僅用於算頁數，不做內容解析）
- 重試設計：內容驗證失敗（`upload_failed`）與網路中斷（`uploading`）皆視為可重試狀態，允許換檔用同一會話重新完成——比原 DOR 設想更寬鬆，換檔即可用同一 idempotencyKey 修正
- 沿用 KB-019 教訓：新表 `documents` 上線前主動檢查並修正 `projects-service.test.ts`／`profiles-service.test.ts` 的 `afterAll` 清理順序，未再踩雷
- 瀏覽器沙盒環境對 `window.open`（預覽新分頁）似乎有已知限制，曾讓分頁卡死；改用真實 curl 對 Supabase Storage 直接驗證預覽/刪除更可靠，不影響功能正確性判斷

### 給下一個 Sprint 的具體提醒
- E2-F2（PDF 解析管線）開工前，先讀 KB-021（惡意檔案掃描缺口）決定是否要提前處理
- 任何新表若會被 `@projects.test.invalid` 系列測試建立且有 FK 參照，記得檢查所有既有測試檔的 `afterAll`（KB-019）

## Sprint 5 — E1-F5：個人健康背景模組 ✅

- 期間：2026-07-15（單日完成實作、本機驗證、commit、push、正式站部署驗證）
- DOR：✅ 通過（sprints/sprint-05-dor.md；A16–A17 由 PO 追認）
- 目標：`health_profiles` jsonb＋autosave＋OCC＋四層鏈第 3 層「資源屬於專案」 → **達成，已部署正式站**（`https://health-devkit.zeabur.app/api/projects/{id}/profile` 回 401 確認新版上線）

### 驗收結果（AC-1～AC-8；整合測試＋真實瀏覽器＋curl 驗證）
| AC | 結果 |
|---|---|
| AC-1 | ✅ 整合測試：尚未建立回 `profile:null`（合法初始狀態） |
| AC-2 | ✅ 整合測試＋瀏覽器實測：首次建立 `version=1` |
| AC-3 | ✅ 整合測試：正確 version 更新成功 `version+1`；舊 version 回 `VERSION_CONFLICT` 不覆寫 |
| AC-4 | ✅ 整合測試（本輪關鍵）：同一使用者兩個專案背景資料互相隔離，不會因「都是本人擁有」而混淆 |
| AC-5 | ✅ 整合測試＋真實 curl：跨帳號一律 403 `PROJECT_ACCESS_DENIED`＋稽核 log |
| AC-6 | ✅ 整合測試：專案已軟刪除後背景視同不存在 |
| AC-7 | ✅ 瀏覽器實測：重新整理頁面，`過敏`/`慢性疾病` 等欄位內容保留（續編） |
| AC-8 | ✅ 整合測試＋真實 log 檢查：跨帳號拒絕 log 僅含 `userId`／`projectId` 識別碼，不含填寫的健康描述內容 |

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 10 檔／41 test 全綠；`pnpm build` 乾淨過；typecheck／lint 無錯誤
- [x] 肉眼驗收：本機真實瀏覽器走過填寫/autosave/續編/跨帳號拒絕全流程
- [x] 修正皆反映於規格與文件：SDD §15／SPRINT_LOG／KB-019 更新／SYNC／ROADMAP 已更新；OpenAPI 已補 `/api/projects/{id}/profile`
- [x] 假設 A16–A17 已於 DOR 追認；本輪無新增 A 編號
- [x] 追加 DOD：四層權限鏈第 3 層為本輪 P0（AC-4）；日誌掃描為 P0 中的 P0（AC-8，首次真正儲存健康內容）；LLM Streaming N/A
- [x] PO 2026-07-15：確認 commit（`02dd80a`）＋push＋正式站部署驗證通過
- [x] 下一步明確：E1 全數完成，下一階段轉往 E2 或補 E1-F3，待 PO 決定

### 本輪修正的測試基礎設施回歸
新增 `health_profiles` 表後，`projects-service.test.ts` 原本的 `afterAll` 直接刪 `projects` 未先清新表 `health_profiles`，被 FK 擋下（`profiles-service.test.ts` 沿用同網域建立真實 projects 觸發）。修正：`projects-service.test.ts` 清理邏輯改為先查出使用者名下所有 projects、逐一清 `health_profiles` 後才刪 `projects`。已更新 KB-019：**任何刪除某表的清理邏輯，都必須先刪光所有 FK 參照它的表——包含當下還不存在、之後才新增的表**，網域區隔只能防「不同測試檔互相誤刪」，防不了「同一批使用者底下新表接舊表的 FK 鏈」。

### 給下一個 Sprint 的具體提醒
- 每新增一張會被既有測試資料 FK 參照的表，回頭檢查所有可能觸及該資料的既有測試檔清理順序（KB-019）
- E1 全 5 個 Feature 至此皆完成（F1/F2/F4/F5 已做，F3 Google 登入依 05_BACKLOG 排序後移）——平台與信任基座收尾，下一階段可轉往 E2（健檢資料入庫管線）或視 PO 決定回頭處理 KB-018／KB-020

## Sprint 4 — E1-F4：健康專案模組與四層權限鏈（安全基線 🔴）✅

- 期間：2026-07-15（單日完成實作、本機驗證、commit、push、正式站部署驗證）
- DOR：✅ 通過（sprints/sprint-04-dor.md；A11–A14 由 PO 追認，A15 為實作中新發現）
- 目標：`projects` CRUD／封存／還原／軟刪除＋四層權限鏈（登入→擁有權→資源屬於專案→未刪除）＋RLS 政策就緒 → **達成，已部署正式站**（`https://health-devkit.zeabur.app/api/projects` 回 401 確認新版上線）

### 驗收結果（AC-1～AC-9；本機真實瀏覽器＋整合測試＋正式站部署驗證）
| AC | 結果 |
|---|---|
| AC-1 | ✅ 整合測試＋瀏覽器實測：建立成功，owner／status/active／version=1 |
| AC-2 | ✅ 整合測試：列表排除已刪除、依 last_accessed_at 排序、標示最近專案 |
| AC-3 | ✅ 整合測試＋瀏覽器實測：改名成功 version+1；帶舊 version 回 VERSION_CONFLICT 不覆寫（本案首次落地 OCC） |
| AC-4 | ✅ 整合測試＋瀏覽器實測（含 window.confirm 防誤觸）：封存⇄還原皆成功且冪等 |
| AC-5 | ✅ 整合測試＋瀏覽器實測：刪除後任一操作視同不存在 |
| AC-6 | ✅ 整合測試＋真實 curl 跨帳號請求：一律 403 PROJECT_ACCESS_DENIED＋warn log（僅含識別碼） |
| AC-7 | ✅ curl 實測：未登入回 401 AUTH_REQUIRED，與 AC-6 的 403 語意明確區分 |
| AC-8 | ⚠️ 部分：RLS 政策已建立但因連線角色 BYPASSRLS 尚未實際生效（KB-018/A15）；真正防線為應用層四層鏈，已驗證 |
| AC-9 | ✅ e2e＋整合測試：未登入頁面顯示提醒與登入連結；稽核 log 僅含白名單識別碼 |

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 9 檔／34 test 全綠；`pnpm build` 乾淨過；typecheck／lint 無錯誤
- [x] 肉眼驗收：本機真實瀏覽器走過建立/改名/封存/還原/刪除全流程＋跨帳號拒絕
- [x] 修正皆反映於規格與文件：SDD §15／SPRINT_LOG／KB-018/019/020／SYNC／ROADMAP 已更新；OpenAPI 已補 `/api/projects` 系列
- [x] 假設 A11–A14 已於 DOR 追認；本輪新增 A15（實作中發現，見 sprint-04-dor.md）
- [x] 追加 DOD：四層權限鏈為本輪 P0（AC-6～AC-8）；日誌掃描通過（AC-9）；LLM Streaming N/A
- [x] PO 2026-07-15：確認 commit＋push＋正式站部署驗證（`/api/projects` 401 確認新版上線）；KB-018／KB-020 決定暫緩處理
- [x] 下一步明確：Sprint 5（E1-F5）DOR 已通過，待開工

### 本輪重大發現（非本輪 bug，但值得記錄）
1. **RLS BYPASSRLS 發現**（KB-018）：`DATABASE_URL` 連線角色為 Supabase `postgres`，`rolbypassrls=true`，RLS 政策對 app 自身連線不生效；真正防線是應用層四層鏈。修法（另建專用角色）需 PO 確認後才動手，屬正式環境憑證異動。
2. **E1-F2 遺留問題**：手動用全新帳號（未點驗證信）走真實 Supabase 登入時，一律回 `email_not_confirmed`，與 C6「未驗證帳號可登入」牴觸。Sprint 3 的自動化測試用 FakeAuthAdapter 未曾真正打到 Supabase，故未發現。已另開背景任務追蹤修復，不在本輪範圍內處理。
3. **測試資料網域碰撞**（KB-019）：新測試檔與既有 `auth-service.test.ts` 共用 `%@test.invalid` 清理萬用字元，因新表有 FK 參照而互炸；改用獨立網域尾綴解決。

### 給下一個 Sprint 的具體提醒
- 部署前：先確認是否要處理 KB-018（RLS 專用角色）與 E1-F2 登入問題，或先部署本輪成果、兩者列入已知限制
- 新增會被 `@test.invalid` 系列測試建立且有 FK 參照 `users` 的表時，測試檔一律用獨立網域尾綴（KB-019）

## Sprint 3 — E1-F2：帳號生命週期模組 ✅

- 期間：2026-07-12 開工，2026-07-15 完整驗收通過（跨日：中間卡在部署事故排查）
- DOR：✅ 通過（sprints/sprint-03-dor.md；A7–A10 由 PO 追認）
- 目標：Email 註冊/驗證/登入/忘記密碼/session/鎖定（C6–C9、C11）＋公開站 auth UI → **達成，含 PO 本人完整走過真實流程**

### 驗收結果（AC-1～AC-8 全數通過，含 PO 現場實測）
| AC | 結果 |
|---|---|
| AC-1 | ✅ PO 正式站親自註冊，條款＋18 歲勾選、consent_records 入庫 |
| AC-2 | ✅ 單元測試（TDD 種子）：同 Email 再註冊回 EMAIL_EXISTS，不建第二帳號 |
| AC-3 | ✅ PO 正式站親自登入，顯示「登入成功！」，session 建立 |
| AC-4 | ✅ 單元測試＋PO 實測：未驗證帳號可登入並顯示提醒（C6） |
| AC-5 | ✅ 單元測試：15 分鐘 5 次鎖 15 分鐘、累犯翻倍、視窗重算、成功歸零（C7） |
| AC-6 | ✅ **PO 親自完整走完**：忘記密碼→收信→點連結→設新密碼→用新密碼登入成功（C9） |
| AC-7 | ✅ 單元測試：登出撤銷 session，之後驗證失敗 |
| AC-8 | ✅ e2e：鍵盤可完成註冊流程；日誌不含 Email/密碼（redaction 斷言） |

### DOD 核對
- [x] 正常／邊緣／錯誤／回歸測試通過：Vitest 27/27、Playwright 9/9、CI 綠
- [x] 肉眼驗收：PO 於正式站完整走過註冊／登入／忘記密碼三條路徑
- [x] 修正皆反映於規格與文件；SDD §15／ROADMAP／SYNC／KB-009~014 已更新
- [x] 假設 A7–A10 已於 DOR 追認；本輪無新增 A 編號
- [x] 追加 DOD：日誌掃描 ✅（Email/密碼不落地實測）；四層權限鏈部分適用（session 驗證為第一層，完整鏈於 E1-F4）；LLM Streaming N/A
- [x] 下一步明確：Sprint 4（E1-F4）DOR

### 本輪重大事件與教訓（本 Sprint 篇幅最長的一輪，記錄完整以利未來借鏡）
1. **GoTrue Admin API 不接受新版 sb_secret_ 金鑰**（KB-009）：改用官方非 Admin API 流程（signUp 的 identities:[] 判斷重複、verifyOtp 後同 client 直接 updateUser）
2. **API route 缺頂層例外防護**（KB-010）：未預期例外曾讓回應變成「200 但空 body」而非乾淨錯誤，建立 `withErrorEnvelope` wrapper 統一補強六支路由
3. **Supabase 免費方案信件限流**（KB-011）：診斷測試耗盡每小時配額，結構化為 EMAIL_RATE_LIMITED 而非裸 500
4. **密碼重設架構整個重寫**（KB-012）：免費方案未接自訂 SMTP 前 Email 樣板無法自訂，原本 token_hash 設計完全走不通，PO 實測發現無限迴圈；改為瀏覽器端監聽 PASSWORD_RECOVERY 事件＋全域 hash 攔截，移除已死的後端 token_hash 路徑
5. **三次意外機密外洩**（同一 session）：Zeabur CLI 變數列表輸出未完整遮蔽（兩次）、對 `.env` 誤用 Read 工具（一次）——資料庫密碼與 Supabase secret key 因此三度輪替；已建立永久行為修正記憶（絕不對含機密檔案使用會印出內容的工具）
6. **Zeabur 專屬伺服器記憶體吃緊**（KB-013）：1C/2GB 同時跑 web+worker+另一專案，同時重啟多個 service 觸發 MemoryPressure 逐出循環；**PO 已將伺服器升級為 2C/4GB**，問題根治
7. **Supabase pooler 斷路器**（KB-014，本輪最終真相）：密碼輪替期間舊 pod 用舊密碼連線失敗累積，觸發 `ECIRCUITBREAKER`，之後即使密碼正確、新連線仍暫時被封鎖，與密碼錯誤訊息完全相同、長時間誤導診斷方向；靠 `service exec` 直接跑 verify-db.ts 才看到完整錯誤訊息定位；等待冷卻後恢復
8. **PowerShell 讀 `.env` 編碼誤判**（KB-015）：含 CJK 註解時 `Get-Content` 不指定編碼會誤判特定行不存在，需明確加 `-Encoding UTF8`
9. **Zeabur `service exec` 無法傳遞帶減號旗標**（KB-016）：`sh -c "..."`／`node --eval` 皆被 CLI 誤判為自身旗標而報錯；改執行專案內不需旗標的診斷腳本繞過
10. **本機 build/start 診斷殘留 `.next` 與殭屍 port**（KB-017）：production build 診斷後沒清乾淨，導致切回 dev/e2e 時出現假性 404 與 3000 埠逾時，一度誤判為程式壞掉

### 給下一個 Sprint 的具體提醒
- **輪替密碼／金鑰時一次到位**：同步更新所有會連線的 service（web＋worker）再重啟，不要分批多次改，避免觸發 KB-014 斷路器
- **一次只重啟一個 service**，確認 health 200 穩定後再動下一個（KB-013）
- 檢查 `.env` 結構一律用腳本讀值判斷布林/長度，絕不印出內容（含 Zeabur `variable list`）

## Sprint 2 — E1-F1 後半：骨架收斂 ✅

- 期間：2026-07-12（單日完成）
- DOR：✅ 通過（sprints/sprint-02-dor.md；A4–A6 由 PO 追認）
- 目標：CI＋Zeabur 雙 service 部署＋API 基座＋日誌 redaction 基線＋runbook → **達成，E1-F1 Feature 結案**

### 驗收結果（AC-1～AC-6 全數通過）
| AC | 結果 |
|---|---|
| AC-1 | ✅ GitHub Actions 綠勾（lint/typecheck/test，39 秒；A4：CI 不連 DB，整合測試自動跳過） |
| AC-2 | ✅ https://health-devkit.zeabur.app 首頁與 /api/health 皆 200（公開網址實測） |
| AC-3 | ✅ 本地 enqueue → **雲端** Worker 秒級撿起：echo completed、fail 重試 2/2 → failed；Zeabur 日誌僅白名單欄位 |
| AC-4 | ✅ /api/health 200＋request_id（body 與 x-request-id header 一致）；未定義端點回統一 error envelope（雲端實測） |
| AC-5 | ✅ redaction 測試：非白名單欄位剔除＋redactedFieldCount 標記、原始輸出無敏感值；requestId 貫穿 Web 與 Worker 雲端日誌 |
| AC-6 | ✅ runbook 四節（docs/runbook.md）；OpenAPI 3.1 格式驗證測試通過（openapi/openapi.json） |

### DOD 核對
- [x] 正常／邊緣／錯誤／回歸測試通過（Vitest 12/12、Playwright 3/3、CI 綠）
- [x] 肉眼驗收：公開網址可開
- [x] 部署基礎設施：Zeabur 專案 6a531b1bb421dcaba7ae2578（Linode Tokyo 專屬伺服器）；service ID 記於 CLAUDE.md；push-to-deploy 已驗證
- [x] 修正皆反映於規格與文件；SDD §15／ROADMAP／SYNC／KB 已更新
- [x] 假設 A4–A6 已於 DOR 追認；本輪無新增 A 編號
- [x] 追加 DOD：日誌掃描 ✅（redaction 基線＋雲端日誌實測）；LLM Streaming／權限鏈 N/A
- [x] 下一步明確：Sprint 3（E1-F2）DOR

### 本輪事件與教訓
1. Zeabur 的 GitHub App 授權與 Supabase 的 GitHub 整合是兩回事，需分別授權（PO 已加 health-devkit）
2. 部署目標拍板：現有 Linode Tokyo 專屬伺服器（1C/2GB，與 Supabase 同城，不額外花錢）；資源吃緊時再升級
3. Zeabur 機密設定流程確立：值由腳本從本機 .env 直送 CLI、輸出遮蔽，不經對話（A6 落地）
4. tsx 移入 dependencies（Worker 生產執行期需要）

## Sprint 1 — E1-F1 前半：技術棧 PoC 驗證線 ✅

- 期間：2026-07-12（單日完成）
- DOR：✅ 通過（sprints/sprint-01-dor.md；A1–A3 由 PO 追認）
- 目標：Next.js＋TS＋Drizzle＋Supabase 東京 PG（pgvector）＋PG queue Worker＋測試框架端到端跑通 → **達成，「首用技術棧」🔴 風險解除**

### 驗收結果（AC-1～AC-6 全數通過）
| AC | 結果 |
|---|---|
| AC-1 | ✅ migrate→pgvector／queue_jobs 出現；rollback→兩者消失；重 migrate→復原（Supabase 東京實庫實測） |
| AC-2 | ✅ Playwright：首頁 200、渲染、無 console error |
| AC-3 | ✅ 真實 Worker 秒級撿起 poc-echo 並 completed |
| AC-4 | ✅ poc-fail 重試 2/2 後標 failed；Worker 遇 DB 暫時例外自癒續行；日誌僅白名單欄位、payload 不落地 |
| AC-5 | ✅ Vitest 7/7（含佇列整合 4 項連實庫）；Playwright 1/1 |
| AC-6 | ✅ typecheck＋lint 0 錯；adapter 層外禁 vendor SDK 由 ESLint 規則把關 |

### DOD 核對
- [x] 正常路徑／邊緣（空佇列、重試邊界）／錯誤狀態（失敗鏈、Worker 自癒）測試通過
- [x] 回歸：修正測試隔離 bug 後全套重跑全綠
- [x] 肉眼驗收：首頁可開；README 五步指南可循
- [x] 無新增 UI/UX 問題（本輪僅佔位頁）
- [x] 修正皆反映於規格與 KB（測試隔離修法記 KB-007，無規格外手補）
- [x] Analyze 品質盤點：TS strict＋noUncheckedIndexedAccess；憲法 §1（Adapter 邊界）／§2（命名）／§4（白名單日誌）落地檢查通過
- [x] SDD §15／SPRINT_LOG／KNOWLEDGE_BASE（KB-004～007）／ROADMAP 已更新
- [x] 假設 A1–A3 已於 DOR 追認；本輪無新增 A 編號
- [x] 追加 DOD：LLM Streaming N/A（無 LLM；LlmAdapter 介面已強制僅串流）；四層權限鏈 N/A（無健康查詢）；日誌掃描 ✅（Worker 白名單日誌實測）
- [x] 下一步明確：Sprint 2 DOR

### 本輪事件與教訓
1. 專案自中文路徑搬遷至 `Medical-AI-Work\health-devkit`（Node CJK 崩潰，KB-004）；GitHub／Supabase 整合不受影響
2. PO 金鑰誤填 `.env.example`，commit 前攔下還原；已建議輪替 secret key（KB-006）
3. 佇列整合測試隔離 bug 一枚，當輪修復（KB-007）
4. Worker 啟動初期一次暫時性 DatabaseError，自癒機制正常（觀察項，Sprint 2 部署後留意）
