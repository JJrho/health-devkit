# Sprint Log — 個人健康檢查管理平台

> 目前狀態：Sprint 3 ✅ 完成（2026-07-12～07-15）——**E1-F2 帳號生命週期結案（Feature 2/20）**。下一個：Sprint 4（E1-F4 健康專案模組與四層權限鏈，安全基線 🔴）DOR。

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
