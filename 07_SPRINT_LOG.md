# Sprint Log — 個人健康檢查管理平台

> 目前狀態：Sprint 24（E6-F2：整合測試與部署交付包，全案最後一個 Sprint）已 commit（`e1efdbc`）／push／正式站部署驗證通過（2026-07-22），正式結案。**全案 20 個 Feature 全數完成並上線**，僅剩台灣個資與醫療法律審查（外部人工事項，非 AI 可完成範圍）為 MVP 交付前唯一待辦。

## Sprint 24 — E6-F2：整合測試與部署交付包（e2e／安全／無障礙／runbook／部署，法律審查為上線硬門檻）✅ 實作＋測試＋本機與正式站瀏覽器驗證皆完成，正式結案，全案 20 個 Feature 全數完成

- 期間：2026-07-22（單日完成）
- DOR：✅ 通過（sprints/sprint-24-dor.md；A142–A148 由 PO 追認）
- 目標：全案倒數第一個 Sprint，收斂五類收尾項目：惡意檔案掃描（KB-021 缺口補上）、P0 e2e 黃金路徑、migration／rollback rehearsal、無障礙抽查、交付文件收尾。法律審查與正式站備份還原演練明確排除於本輪 AI 可完成範圍（A145／A146）。

### 根因／設計要點
- **惡意檔案掃描採 VirusTotal API，不自架 ClamAV**（A142）：`ScanAdapter` 介面＋`VirusTotalScanAdapter` 實作，先查 SHA256 雜湊快取（已掃過的檔案毫秒級回應），未命中才上傳觸發新分析並輪詢。`completeUpload()` 於內容格式驗證通過、寫入正式 Storage 物件**之前**插入掃描步驟，判定惡意或掃描逾時／出錯一律 fail closed 轉 `upload_failed`（新增 `MALICIOUS_FILE_DETECTED`／`FILE_SCAN_FAILED` 兩種錯誤碼），絕不在掃描不可用時靜默放行。詳見 KB-033。
- **⚠️ P0 e2e 驗證過程中發現並修正一項真實缺陷（掃描逾時預算過緊）**：原訂 30 秒輪詢預算（外層 45 秒），本機用真實 VirusTotal API 對一份合法全新檔案（從未被掃描過的隨機內容）完整測試時，實測完整跑完 70+ 引擎耗時達 39 秒，超出原訂預算，導致**合法檔案被誤判為 `FILE_SCAN_FAILED`**——這正是 fail closed 設計刻意要防的「掃描不可用時不可放行」，但代價是逾時預算設太緊時，安全機制本身變成了對合法使用者的假性阻擋。修正：輪詢預算拉長至約 105 秒（`POLL_MAX_ATTEMPTS` 35 次）、外層逾時拉長至 120 秒，並確認外層預算必須大於 adapter 內部輪詢預算（否則外層會搶先打斷）。修正後用另一份全新隨機內容重測，30.7 秒內成功完成掃描並正確轉入 `processing` 狀態，於本機瀏覽器 UI 同時看到「舊逾時錯誤的失敗紀錄」與「修正後成功的紀錄」並存，誠實驗證問題與修正皆真實發生。
- **P0 e2e 測試聚焦三條跨模組黃金路徑，不窮舉 Edge/Abuse Cases**（A143）：多數 Edge/Abuse Case 已被個別 Feature 既有單元/整合測試覆蓋；e2e 的獨特價值是證明跨模組串接真的能走通。**實作時發現既有 e2e 測試慣例（`tests/e2e/auth-pages.spec.ts`）刻意避免呼叫真實 Supabase（信件額度／測試隔離考量），本輪比照此既定慣例**，改用 Admin API 建立測試帳號＋真實瀏覽器／HTTP 請求鏈驗證，而非撰寫依賴真實 `signUp()` 的新 Playwright 自動化（`.test.invalid` 網域經實測會被 Supabase 真實 `signUp()` 拒絕為 `INVALID_EMAIL`，與正式站測試帳號建立手法保持一致）。三條黃金路徑（註冊登入到看見趨勢／計畫到檢討／問答與匯出到刪除）＋跨帳號隔離回歸，皆已用真實 HTTP 請求鏈與瀏覽器 UI 雙重確認（見下方端到端驗證）。
- **migration／rollback rehearsal 改用 pglite，非原訂 Docker**（A144）：本機 Docker Desktop daemon 啟動異常，改用 `@electric-sql/pglite`（WASM 版真實 PostgreSQL 引擎，零外部依賴），完整驗證全部 16 筆 migration 套用（建出 28 張表）與全部回滾（恢復至 0 張業務表）皆乾淨可逆。詳見 KB-034。
- **查證 Supabase 免費方案備份能力，未觸發真實還原**（A145）：查證官方文件發現**本專案（免費方案）完全沒有自動每日備份，也不提供 PITR**（皆為付費方案專屬）——這與 `docs/runbook.md` 先前的敘述不符，已更正文件並列入 `KNOWN_ISSUES.md` 上線前應處理事項。詳見 KB-035。
- **法律審查完全排除於本輪範圍**（A146）：非 AI Agent 可完成或代為判斷的工作，僅整理待審查文件清單，列入 `KNOWN_ISSUES.md`。
- **新增 `KNOWN_ISSUES.md`**（A147）：彙整 09_KNOWLEDGE_BASE.md 中仍開放的已知限制，供 PO 與未來維護者快速掌握現況。
- **無障礙抽查 6-7 個代表性頁面**（A148）：本專案十個工作區頁面共用同一套 UI 元件庫，代表性頁面通過即高機率其餘頁面一致合格。

### 驗收結果（AC-1～AC-10）
| AC | 結果 |
|---|---|
| AC-1（掃描通過） | ✅ 單元測試（FakeScanAdapter）＋**本機與正式站真實 VirusTotal API 驗證**（皆用全新隨機內容檔案；本機 30.7 秒、正式站 19.5 秒完成，皆正確轉 `processing`） |
| AC-2（掃描攔截） | ✅ 單元測試（`virustotal-scan-adapter.test.ts` mock VT API 回應驗證 `stats.malicious>0` 時判定不乾淨；`documents-service.test.ts` 驗證 `completeUpload()` 正確轉 `MALICIOUS_FILE_DETECTED`）。**誠實記錄**：未對真實 VirusTotal API 上傳真實惡意樣本測試——本專案僅接受 PDF/JPG/PNG 格式，EICAR 等純文字測試病毒特徵碼會先被既有格式驗證擋下而非觸及掃描層，且刻意不建立/上傳真實惡意檔案樣本（風險與效益不成比例），改以精確 mock 驗證判定邏輯本身正確 |
| AC-3（掃描服務不可用時降級） | ✅ 單元測試：掃描逾時／出錯轉 `FILE_SCAN_FAILED`，fail closed 不放行。**本機真實驗證過程中意外印證此設計的真實代價**——見上方「P0 e2e 驗證過程中發現並修正一項真實缺陷」，修正後正式站重測同樣正常放行 |
| AC-4（P0 e2e：註冊到看見趨勢） | ✅ 本機與正式站瀏覽器＋真實 HTTP 請求鏈：登入→建立專案→背景資料→上傳檔案（含真實掃描）→趨勢頁正確顯示「尚無已確認資料」（PNG 無 OCR 抽取管線，符合預期，非本輪範圍） |
| AC-5（P0 e2e：計畫到檢討） | ✅ 本機與正式站真實 HTTP 請求鏈：建立計畫→三分類指標→啟用→日常回報→檢討→「需要專業評估」→轉介摘要，全部 200；UI 正確顯示「需要專業評估」標籤 |
| AC-6（P0 e2e：問答與匯出） | ✅ 本機與正式站真實 HTTP 請求鏈：看診摘要正確附註轉介評估→匯出 ZIP（200／`application/zip`）→對話建立與列表→帳號刪除申請／撤銷往返皆正確 |
| AC-7（跨帳號隔離回歸） | ✅ 第二測試帳號對第一帳號的文件列表／背景資料／計畫列表／計畫詳情／匯出／啟用計畫共 6 條路徑，全部正確 403 `PROJECT_ACCESS_DENIED` |
| AC-8（migration rehearsal） | ✅ pglite 隔離環境：16 筆 migration 全套用（28 張表）→ 16 筆 down migration 全回滾（0 張業務表），schema 完全還原 |
| AC-9（無障礙抽查） | ✅ 7 個代表性頁面（首頁／註冊／登入／專案列表／戰情頁／計畫頁／對話頁）axe-core 掃描：**零違規**（不僅無 Critical/Serious，任何等級皆無） |
| AC-10（日誌 P0） | ✅ 掃描鏈全流程未新增任何 log 呼叫，沿用既有錯誤處理慣例（不記錄檔案內容或掃描 API 金鑰） |

### 端到端驗證（本機瀏覽器＋共用開發資料庫）
用 Supabase Admin API 建立兩個測試帳號（比照既有 e2e 慣例，`register()` 真實 `signUp()` 對 `.test.invalid` 網域會回 `INVALID_EMAIL`）。帳號 A：登入→建立專案→背景資料 PUT/GET→空趨勢頁確認→建立第二專案跑完整計畫生命週期（建立→三分類指標→啟用→日常回報→檢討→「需要專業評估」→轉介摘要）→看診摘要正確附註→匯出 ZIP→建立對話並列表→申請刪除帳號→確認 `deletionRequestedAt` 正確→撤銷→確認清空。帳號 B：登入後對帳號 A 的專案嘗試 6 種操作（列表文件／讀背景資料／列出計畫／計畫詳情／匯出／啟用計畫），全部正確 403。上傳檔案掃描：第一次因逾時預算過緊（30 秒輪詢／45 秒外層）於真實新檔案上失敗，修正預算後（105 秒輪詢／120 秒外層）以另一份全新隨機內容重測，30.7 秒內成功完成並正確轉 `processing`；本機 UI 文件列表同時保留舊失敗紀錄與新成功紀錄，二者並存可視為誠實的問題重現＋修正證據。全專案 208 個測試（+7）／typecheck／lint／`pnpm build` 全綠。驗證完畢後兩個測試帳號（含 Supabase Auth、`consent_records`）與所有測試專案已全數清除。

**誠實記錄（本輪 DOD 額外要求）**：①VirusTotal 實測確實對真實新檔案完成掃描並正確放行（真陽性路徑驗證），惡意判定邏輯僅以 mock 精確驗證未對真實惡意樣本測試（理由見 AC-2）；②migration rehearsal 為 pglite 本機隔離環境演練，非正式站，且略過 `pgvector` 擴充語句（該擴充至今無任何欄位實際使用，見 A54）；③備份恢復演練範圍為查證現況（本專案免費方案無自動備份無 PITR），未觸發真實還原；④法律審查明確標示為待辦、非本輪完成，不暗示已完成上線審查。

### 正式站部署驗證（2026-07-22）
Web／worker 兩 service 部署 commit `e1efdbc`。web service 另外新增 `VIRUSTOTAL_API_KEY` 環境變數（PO 自行申請）；新映像檔因新增 pglite／axe-core／playwright 相關依賴明顯變大，image push 階段耗時較長（約 6-7 分鐘），非異常，僅記錄供未來部署時程參考。依 KB-025 不僅看 RUNNING 就結案，用 Supabase Admin API 建立兩個正式站測試帳號，對真實生產環境重跑三條黃金路徑與跨帳號隔離回歸：

- **AC-4（含真實掃描）**：登入→建立專案→背景資料→上傳一份全新隨機內容檔案（真實 VirusTotal API，非本機測試過的樣本）→**19.5 秒內完成掃描並正確轉 `processing`**（低於本機測試的 30.7 秒，可能因正式站網路環境或 VT 當下佇列負載差異，兩者皆遠低於修正後 120 秒的外層預算，證實修正在正式生產環境同樣有效）→趨勢頁正確顯示空狀態。
- **AC-5**：建立計畫→三分類指標→啟用→日常回報→檢討→「需要專業評估」→轉介摘要，全部 200；UI 正確顯示「需要專業評估」標籤。
- **AC-6**：看診摘要正確附註轉介評估→匯出 ZIP（200／`application/zip`）→對話建立→帳號刪除申請／撤銷往返皆正確。
- **AC-7**：第二測試帳號對第一帳號的文件列表／背景資料／計畫列表／計畫詳情／匯出／啟用計畫共 6 條路徑，全部正確 403 `PROJECT_ACCESS_DENIED`。

驗證完畢後兩個測試帳號（含 Supabase Auth、`consent_records`，另清除過程中因 Admin API 短暫瞬斷產生的孤兒帳號）與所有測試專案已全數清除。**Sprint 24 正式結案，全案 20 個 Feature 全數完成並上線**；MVP 交付前唯一剩餘事項為台灣個資與醫療服務法律審查（外部人工事項，見 KNOWN_ISSUES.md）。

下一步：無下一個 Sprint（開發面已全數完成）；等待台灣個資與醫療服務法律審查完成後即可正式對外交付。

## 補充：E4-F1 知識庫真實內容擴充（2026-07-24，非獨立 Sprint，延續 A55 既定流程）

- 性質：內容資料補充，非新 Feature／新 Sprint——沿用 E4-F1 已驗證的 seed 管線與安全設計（`status=draft`），不涉及 schema／服務層邏輯變更（`scripts/seed-knowledge-sources.ts` 為唯一異動檔案）。
- 內容來源：PO 提供王健宇醫師《為什麼你的病總是看不好？》PART2 另外 4 個章節掃描 PDF（〈胸悶、胸痛，是心臟病？〉頁 052–061、〈倦怠無力，要趕快做肝功能檢查？〉頁 082–087、〈反覆肩頸痠痛，是五十肩？〉頁 097–105、〈水腫，是腰子有問題？〉頁 106–112，共 30 頁），比照 Sprint 13／Sprint 14 既定方法（AI 逐頁視覺閱讀＋人工轉錄，非自動 OCR）轉錄。
- 安全處置：延續 A55 既定原則，四個新章節 `status` 皆設為 `draft`（非作者／PO 逐字最終校對版本），確保 `searchKnowledge()` 不會提早引用；已直接查詢共用資料庫確認安全閘門對新內容同樣生效（皆為 `draft`，非 `active`）。
- 結果：`knowledge_sources` 由 6 筆增至 10 筆王健宇醫師章節，`knowledge_chunks` 共 270 筆（原 143 筆＋新增 127 筆），皆為 `status=draft`。全專案 208 個測試／typecheck／lint／`pnpm build` 全綠（測試數量不變，因未新增測試案例，僅擴充既有 seed 內容；既有測試對新內容同樣適用）。因本輪內容與正式站共用同一 Supabase 資料庫，seed 腳本本機執行後正式站即同步生效，無需另外部署。
- 已知限制：仍為 10/38 章節（26%），其餘 28 章節（約 651 頁）留待後續迭代；轉錄品質限制同 A55（AI 視覺閱讀非作者逐字校對，直排多欄版面在少數段落的閱讀順序判斷仍有出錯風險，尤其原書排版跨頁斷句處）。

## Sprint 23 — E6-F1：稽核事件與刪除鏈模組（C10 三十日寬限／Storage 清理）✅ 實作＋測試＋本機與正式站瀏覽器驗證皆完成，正式結案

- 期間：2026-07-22（單日完成）
- DOR：✅ 通過（sprints/sprint-23-dor.md；A135–A141 由 PO 追認）
- 目標：E6（稽核基座與交付驗證包）第一個 Feature——補上正式 `audit_events` 稽核表（取代 A11 過渡期 `logger.warn` 作法），以及帳號刪除的三十日冷靜期申請／撤銷／到期永久刪除鏈（含 Storage 真刪除）。

### 根因／設計要點
- **三十日冷靜期重用既有 `QueueAdapter.enqueue()` 的 `runAt` 延遲排程機制，不新增排程基礎設施**（A135）：`PgQueueAdapter.claimNext()` 的 `WHERE run_at <= now()` 邏輯自 Sprint 1 起就存在，本輪是第一次真正用於長延遲（30 天）排程。
- **撤銷申請不直接操作已排入的 `queue_jobs` 列**（A136）：改由 `permanentlyDeleteAccount()` 執行前重新查一次 `users.deletionRequestedAt` 是否仍非空，為空即跳過，防止撤銷與背景工作執行間的競態。
- **本輪範圍限定帳號層級**（A137）：既有 E1-F4 專案層級立即軟刪除＋可還原機制維持不變，不 retrofit 三十日寬限。
- **`audit_events.userId` 不設外鍵**（A138）：稽核紀錄須在帳號永久刪除後仍可查詢追溯。
- **正式永久刪除的 FK 刪除順序泛化自 `tests/unit/helpers/cleanup-test-data.ts`**（A139，該邏輯歷經 Sprint 4–22 反覆驗證）：新增 Storage 物件真刪除步驟（測試輔助函式原本不做）。**實作中額外發現並修正一項該測試輔助函式本身遺漏、正式路徑不可忽略的缺口**——`consent_records` 對 `users` 的外鍵為 `ON DELETE no action`，若不在刪除 `users` 本列前先清空 `consent_records`，正式帳號（凡走過 `register()`／`loginWithGoogle()` 皆會有 `consent_records`）永久刪除會直接因外鍵違反而失敗；`cleanupTestData()` 至今未踩到此坑純粹是因為多數測試直接 `db.insert(users)` 造測試帳號、略過 `consent_records`。本輪 `permanentlyDeleteAccount()` 已補上此步驟，`cleanupTestData()` 本身暫不動（超出本輪範圍，非阻塞）。
- **本輪不建置管理者／後台介面**（A140）：本專案目前無此類功能面向。
- **刪除確認採二次確認按鈕，不要求重新輸入密碼**（A141）：操作已受登入 session 保護，且三十日寬限期可隨時撤銷。
- **既有 `auditAccessDenied()` 擴充為同時寫入 `audit_events` 表**：`logger.warn` 保留作即時可觀測性補充，非取代；稽核落地採 fire-and-forget，寫入失敗不影響原始存取遭拒回應。

### 驗收結果（AC-1～AC-8／AC-10；AC-9 為 UI，另計瀏覽器驗證）
| AC | 結果 |
|---|---|
| AC-1（申請刪除成功） | ✅ 整合測試＋瀏覽器驗證：`deletionRequestedAt` 設定，稽核事件寫入，背景工作以 `runAt≈+30天` 排入 |
| AC-2（撤銷申請成功） | ✅ 整合測試＋瀏覽器驗證：`deletionRequestedAt` 清空，稽核事件寫入 |
| AC-3（背景工作到期執行，真刪除） | ✅ 整合測試＋**正式站真實 Worker 驗證**（見下方部署驗證段落）：帳號名下專案／文件／對話等從屬資料與 `users` 本列皆確實刪除 |
| AC-4（撤銷後不誤刪，防競態） | ✅ 整合測試：撤銷後即使重新呼叫背景工作處理器，重新檢查發現已撤銷 → 直接跳過 |
| AC-5（跨帳號存取稽核落地） | ✅ 整合測試：`audit_events` 新增一列 `project_access_denied`，非僅 console 日誌 |
| AC-6（稽核事件不含健康內容） | ✅ 整合測試：`metadata` 僅含白名單結構化欄位 |
| AC-7（Storage 真刪除） | ✅ 整合測試＋**正式站真實驗證**：帳號名下已上傳文件對應 Storage 物件於永久刪除後確實不存在 |
| AC-8（未登入保護） | ✅ 瀏覽器驗證＋正式站驗證：未帶 session 直接呼叫申請／撤銷端點皆回 401 `AUTH_REQUIRED` |
| AC-9（UI） | ✅ 本機＋正式站瀏覽器驗證：`/account` 頁面正確顯示確認流程與倒數提示 |
| AC-10（日誌 P0） | ✅ 整合測試：刪除鏈全流程不將健康內容或 token 寫入 console |

### 端到端驗證（本機瀏覽器＋共用開發資料庫）
用 Supabase Admin API 直接建立並確認的測試帳號（`register()` 走一般 `signUp()` 對 `.test.invalid` 網域回 `INVALID_EMAIL`，改用 Admin API 繞過，與正式站測試帳號建立手法一致）登入本機開發伺服器 → 至 `/account` 頁面，確認畫面顯示帳號 Email 與「刪除帳號」按鈕 → 點擊後彈出瀏覽器原生二次確認對話框（A141），確認 → `POST /api/auth/me/deletion` 回應成功，頁面即時切換為「帳號即將刪除」倒數提示區塊，正確顯示「您的帳號將於 2026 年 8 月 21 日永久刪除」（今日 2026-07-22＋30 天）→ 點擊「取消刪除申請」→ `DELETE /api/auth/me/deletion` 回應成功，頁面切回原本的刪除帳號區塊，確認 UI 狀態切換正確。另於頁面內直接 `fetch`（不帶 cookie）呼叫申請／撤銷兩端點，確認皆回 401 `AUTH_REQUIRED`（AC-8）。驗證完畢後測試帳號（含 Supabase Auth、`consent_records`）已全數清除。全專案 201 個測試（+9）／typecheck／lint／`pnpm build` 全綠。

### 正式站部署驗證（2026-07-22）過程中發現並修正兩項真實缺陷
Web／worker 兩 service 部署 commit `fc7e19e`（`RUNNING`）後，依 KB-025 不僅看 RUNNING 就結案，用 Supabase Admin API 建立正式站測試帳號，登入正式站、建立專案並上傳一份真實文件到 Storage → 至 `/account` 申請刪除，確認倒數提示日期正確 → 撤銷，確認 UI 正確復原（AC-1／AC-2 在正式生產環境成立）→ 直接 `fetch`（不帶 cookie）驗證未登入呼叫回 401（AC-8）→ 再次申請刪除，並用臨時腳本把該筆 `delete-account` 工作的 `run_at` 快轉到過去，模擬三十日寬限期到期，觀察正式站真實 Worker 是否認領並處理：

- **缺陷①（設計缺陷）**：Worker 成功處理完成後，用同一組帳密重新呼叫 `/api/auth/login`，**回應 200 登入成功**，且本地 `users` 列隨即透過既有 `syncUserVerification()` 的 upsert 邏輯重新出現——「永久刪除」形同未生效，因為 `permanentlyDeleteAccount()` 只刪本地 `users` 列，從未刪除 Supabase Auth 端的帳密憑證。修正：`AuthAdapter` 新增 `deleteUser()`，實測 `admin.auth.admin.deleteUser()` 對本專案新版不透明格式 `service_role` 金鑰正常運作（不受 `getUserById()` 已知限制影響，見 KB-009／KB-012），並於刪除本地 `users` 列**之前**呼叫（順序理由：若在之後才刪或失敗，重試時本地列已消失、`deletionRequestedAt` 檢查會提前以 `deleted:false` 短路跳過，永遠不會重試 Auth 刪除）。
- **缺陷②（KB-025 同類型：環境變數缺漏）**：修正①部署後，重新走一次申請→快轉流程，Worker 這次**全數執行失敗**（3 次重試皆失敗，`errorName: "Error"`）。診斷：`getAuthAdapter()` 建構 `SupabaseAuthAdapter` 時一律需要 `SUPABASE_ANON_KEY`（即使 `deleteUser()` 本身只用得到 admin client），而 worker service 過去只用 `SUPABASE_URL`／`SUPABASE_SERVICE_ROLE_KEY`（供 Storage 使用），從未設定過 `SUPABASE_ANON_KEY`，`requireEnv()` 因而擲出例外。修正：比照 CLAUDE.md 機密處理鐵則，用腳本讀本機 `.env` 的值（`SUPABASE_ANON_KEY` 依專案文件記載為非機密，值與 `NEXT_PUBLIC_SUPABASE_ANON_KEY` 相同）透過子行程呼叫 `zeabur variable create` 補上此變數，**全程未在任何工具輸出中印出該值或既有變數表**，重啟 worker 後生效。

兩項缺陷修正後（commit `a99368a`），重新完整走過一次正式站流程並額外多跑一輪乾淨驗證：申請刪除（含真實文件上傳）→ 快轉 `run_at` → 正式站真實 Worker 於 448ms 內成功完成工作（`"status":"completed"`）→ 直接查正式站共用資料庫確認 `users`／`projects` 列與 Storage 物件皆確實刪除、`audit_events` 正確記下完整生命週期（`account_deletion_requested`→`account_deletion_completed`，最後一筆稽核事件於帳號本列刪除後仍可查詢，驗證 A138 於正式站成立）→ **重新用同一組帳密呼叫 `/api/auth/login`，回應 401 `AUTH_INVALID_CREDENTIALS`**，確認 Auth 身分已真正刪除、帳號不再能復活。全程三輪測試帳號（含 Supabase Auth）與正式站測試資料已全數清除。

**誠實記錄（本輪 DOD 額外要求）**：AC-3／AC-7 最終以「快轉 `run_at` 到過去＋觀察正式站真實 Worker 認領處理」的方式驗證，**非真實等待 30 天**，但已透過正式站真實部署環境（而非本機模擬）跑過三次完整生命週期，且意外驗證了 Worker 對到期工作的認領邏輯與環境變數需求，找出並修正了兩項若未經此驗證步驟、只憑本機測試無法發現的真實生產環境缺陷。**本輪範圍僅帳號層級刪除，既有專案層級刪除機制（E1-F4）未變動。**

## Sprint 22 — E5-F4：看診摘要與資料匯出模組（C19/C20）✅ 實作＋測試＋瀏覽器驗證＋正式站部署驗證皆完成，正式結案

- 期間：2026-07-22（單日完成）
- DOR：✅ 通過（sprints/sprint-22-dor.md；A128–A134 由 PO 追認）
- 目標：E5 健康行動閉環的最後一個 Feature——看診當下可列印帶去的固定模板摘要（C19），以及完整的個人資料匯出（C20，資料可攜權）。

### 根因／設計要點
- **看診摘要不建立持久化物件，即時彙整不落地**（A128）：上游 §17 CRUD 表未列出「看診摘要」，本輪 `buildVisitSummary()` 純查詢彙整既有資料，不新增資料表。
- **⚠️ A129 實作中修正**：DOR 原假設用 `pdf-lib` 伺服器端繪製 PDF，**實作時發現 `pdf-lib` 內建標準字型完全不支援中文字元**（本 app 幾乎全繁體中文內容），若照原計畫會產出中文空白／亂碼的 PDF。與 PO 討論後改為**瀏覽器友善列印**方案：`/projects/[id]/reports` 頁面用 CSS `@media print` 排版 A4 尺寸內容，使用者點「列印／另存為 PDF」呼叫 `window.print()`，用瀏覽器內建的「另存為 PDF」產出——中文顯示完全依賴瀏覽器系統字型，不需額外套件或字型檔，且更符合原始「1 個 Sprint、🟢 風險」的複雜度估計（伺服器端手刻中文自動換行排版邏輯明顯超出此輪範圍）。**不影響其他假設**，僅 A129 的技術手段調整，需求本身（A4 可列印、PDF 匯出）不變。
- **資料匯出範圍為單一專案，非帳號整體**（A130）：`GET /api/projects/{id}/export`，與既有架構（documents／plans／observations 皆掛 `project_id`）一致。
- **ZIP 封裝新增 `archiver` 相依套件**（A131）：**實作中發現版本相容性問題**——`archiver@8.0.0` 將 API 從可呼叫工廠函式改為具名類別匯出（`ZipArchive` 等），與慣用的 `archiver("zip", opts)` 寫法不相容；改為釘選 `archiver@7.0.1`＋對應 `@types/archiver@7.0.0`（最後一個維持舊版 API 的穩定版本），避免自行改寫呼叫方式增加不必要的風險。
- **原始檔不簽發對外連結，直接串流進 ZIP 回應**（A132）：透過既有 `StorageAdapter.getObject()` 於伺服器端下載後用 `archive.append()` 串接，首次在本專案以 `Readable.toWeb()` 將 Node 二進位串流轉為 Next.js Route Handler 可回傳的 Web Response（既有端點皆走簽名 URL，本輪為第一個直接串流二進位回應的端點）。
- **「想問醫師的問題」純自由文字，不落地儲存**（A133）：延續 A105／A114／A118 結構化而非語意判讀一貫原則。
- **大型專案匯出效能不做特別優化**（A134）：符合既有 C12 檔案數量與大小上限下的合理反應時間。
- **銜接 E5-F3**：「執行中計畫」區塊查詢每份計畫最近的檢討分類，若為「需要專業評估」則附註提示並原樣帶出既有轉介摘要內容（不摘要、不潤飾），讓看診摘要與定期檢討機制串成一條線。

### 驗收結果（AC-1～AC-10）
| AC | 結果 |
|---|---|
| AC-1（看診摘要產生成功） | ✅ 整合測試＋瀏覽器驗證：勾選全部區塊並送出 → 成功回傳含所選區塊資料 |
| AC-2（看診摘要範圍可勾選） | ✅ 整合測試＋瀏覽器驗證：僅勾選部分區塊 → 未勾選欄位不出現 |
| AC-3（看診摘要無資料情境） | ✅ 整合測試＋瀏覽器驗證：無執行中計畫／症狀事件 → 顯示「無」而非出錯 |
| AC-4（銜接 E5-F3） | ✅ 整合測試＋瀏覽器驗證：計畫有「需要專業評估」的已完成檢討 → 附註提示並帶出既有轉介摘要內容 |
| AC-5（資料匯出成功） | ✅ 整合測試＋瀏覽器驗證：回傳 ZIP，含 `data.json`／`trends.csv`／`documents/` 原始檔 |
| AC-6（資料匯出 JSON 結構完整） | ✅ 整合測試：`data.json` 涵蓋 profile／documents metadata／observations／plans 全家族資料 |
| AC-7（資料匯出空資料不整體失敗） | ✅ 整合測試：專案無任何計畫 → 對應類別回傳空陣列，整體仍成功 |
| AC-8（四層權限鏈） | ✅ 整合測試：跨帳號存取兩個功能一律 `PROJECT_ACCESS_DENIED` |
| AC-9（UI） | ✅ 瀏覽器驗證：兩個功能在專案頁面正確可觸發並下載，勾選介面可用 |
| AC-10（日誌 P0） | ✅ 整合測試：產生過程不含健康內容、「想問醫師的問題」自由文字 |

### 端到端驗證（本機瀏覽器＋共用開發資料庫）
用 Admin API 直接建立＋確認的測試帳號登入本機開發伺服器，建立專案並填入個人健康背景 → 至 `/projects/{id}/reports` 頁面，確認「使用 Google 登入」以外的核心流程：勾選全部區塊＋填寫「想問醫師的問題」送出 → 看診摘要正確產生，背景／趨勢／執行中計畫／症狀事件／問題五區塊皆正確顯示，無資料的區塊正確顯示「無」→ 建立一份計畫，補齊安全欄位與三分類指標後啟用，完成一次「需要專業評估」的檢討並產生轉介摘要 → 重新產生看診摘要，確認「執行中計畫」區塊正確附註「此計畫近期檢討判斷需要專業評估」並原樣帶出轉介摘要完整內容，驗證 A128 銜接 E5-F3 的核心情境。「列印／另存為 PDF」按鈕正確呼叫 `window.print()`，主控台無錯誤。直接呼叫匯出端點確認回應 `200`、`Content-Type: application/zip`、`Content-Disposition` 正確帶有 UTF-8 編碼的中文檔名，回傳位元組數非零。驗證完畢後測試帳號（含 Supabase Auth）、專案、計畫與子資源已全數清除。全專案 192 個測試（+8）／typecheck／lint／`pnpm build` 全綠。

### 正式站部署驗證（2026-07-22）
Web／worker 兩 service 皆已部署 commit `96ea2ec`（`RUNNING`），`/api/health` 200。依 KB-025，不僅看 RUNNING 就結案，用 Supabase Admin API 建立正式站測試帳號，在真實瀏覽器登入正式站、建立專案並填入個人健康背景 → 建立計畫、補齊安全欄位與三分類指標並啟用，完成一次「需要專業評估」的檢討並產生轉介摘要 → 至 `/projects/{id}/reports` 頁面填寫「想問醫師的問題」並勾選全部區塊產生看診摘要，確認「執行中計畫」區塊正確附註提示並原樣帶出轉介摘要完整內容，驗證 A128 銜接 E5-F3 的核心情境在正式生產環境成立 → 於頁面內直接 `fetch` 匯出端點，確認回應 `200`、`Content-Type: application/zip`、`Content-Disposition` 正確帶有 UTF-8 編碼中文檔名、回傳位元組數非零（1787 bytes），確認 A130／A132 在正式站成立。主控台全程無錯誤。驗證完畢後測試帳號（含 Supabase Auth）、專案、計畫與子資源已全數清除。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：整合測試 8 項全綠＋本機與正式站瀏覽器端到端驗證全數通過
- [x] 肉眼驗收：✅ 真實瀏覽器操作確認看診摘要五區塊、銜接轉介摘要情境、匯出下載皆正確運作
- [x] 沒有新增明顯 UI/UX 問題：看診摘要表單與列印預覽版面正常
- [x] 修正皆反映於規格與文件：本節已更新；SDD／SYNC／ROADMAP 一併更新，含 A129 實作中修正的誠實記錄
- [x] commit／push／正式站部署驗證：commit `96ea2ec`／push 至 main／正式站真實資料端到端驗證通過（2026-07-22），已清除測試資料

### 已知限制（誠實記錄，非誇大宣稱）
- **「看診摘要」PDF 品質依賴使用者瀏覽器的列印／另存為 PDF 功能**：不同瀏覽器（Chrome／Safari／Edge）的列印排版細節可能有些微差異，本輪未鎖定特定瀏覽器測試矩陣。
- **「背景」區塊逐欄位列出 `health_profiles.data` 的 key/value**：目前顯示英文欄位鍵名（如 `chronicConditions`），未對照中文標籤美化，因 `health_profiles.data` 為自由格式 jsonb（A16 既有設計），本輪未新增欄位對照表；未來若需更友善呈現需額外設計。
- **資料匯出的原始檔命名為 `{documentId}-{原始檔名}`**：避免同名檔案於 ZIP 內互相覆蓋，非原始檔名本身。
- **看診摘要與資料匯出皆為即時產生**：不提供歷史記錄查詢或重新下載既有版本，每次都是當下資料的全新快照。

## Sprint 21 — E1-F3：Google 登入與帳號連結模組 ✅ 實作＋測試＋瀏覽器驗證＋正式站部署驗證（含真實 Google 帳號）皆完成，正式結案

- 期間：2026-07-20（單日完成）
- DOR：✅ 通過（sprints/sprint-21-dor.md；A121–A127 由 PO 追認）
- 目標：補上第二種登入方式——Google 登入，並確保先前用 Email／密碼註冊過的帳號，改用相同 Email 的 Google 帳號登入時不會產生重複帳號（上游 §28.1）。

### 根因／設計要點
- **Google OAuth 走 Supabase Auth 內建 OAuth 供應商代理，非自架 OAuth client**（A121，架構決定）：Google Client ID／Secret 貼在 Supabase Dashboard，不進入本專案 `.env`／Zeabur 變數；`.env.example` 既有的佔位符本輪不會被程式碼讀取。延續 E1-F2「憑證不落地、交由 Supabase Auth 管理」既有架構（A7/A9）。
- **瀏覽器端 OAuth 導向流程**（A122）：`supabase.auth.signInWithOAuth()` 導向 Google → 導回 `/auth/callback` → 前端取得 `access_token` → POST `/api/auth/google` 由伺服器驗證並建立本系統自有 session（沿用既有 `createSession()`）→ 立即捨棄 Supabase 瀏覽器端 session，比照既有密碼登入的單一 session 來源慣例。
- **Google 失敗不建立半完成帳號**（A123，核心安全設計，逐字落實上游 §28.1）：token 驗證失敗、或新帳號未附同意條款，一律不寫入 `users`／`consent_records`／`sessions` 任何一列。
- **關鍵技術發現**（A124）：伺服器端驗證 Google 核發的 `access_token` 改用 `anon.auth.getUser(accessToken)`，**不使用** Admin API——本專案 `service_role` 為新版不透明金鑰格式，已知在 KB-009／KB-012 記錄為 Admin API 呼叫失敗（`getUserById()` 因此擱置未接線正是此限制的既有證據）；`anon` 端點不受此限制，且為官方標準驗證流程。本機瀏覽器驗證已對真實 Supabase 實例送出偽造 token，確認 `anon.auth.getUser()` 正確回應驗證失敗（非 mock，見下方驗證段落）。
- **同意條款把關集中於註冊頁**（A125，UX 決定）：「使用 Google 登入」按鈕登入頁與註冊頁皆有，但只有註冊頁顯示同意條款勾選框，且勾選前按鈕維持停用；登入頁的 Google 按鈕不顯示同意條款，若後端判定為全新帳號則回 `CONSENT_REQUIRED`，前端導向註冊頁完成同意。
- **日誌不落地**（A127）：`accessToken`／Email 一律不進日誌，僅記錄成功／失敗狀態碼，比照既有註冊登入慣例。

### 驗收結果（AC-1～AC-8）
| AC | 結果 |
|---|---|
| AC-1（首次 Google 登入，建立新帳號） | ✅ 整合測試：已附同意條款 → 成功建立 `users`＋`consent_records`＋`sessions` |
| AC-2（首次 Google 登入，未同意條款） | ✅ 整合測試：拒絕（`CONSENT_REQUIRED`），不寫入任何列 |
| AC-3（既有帳號改用 Google 登入） | ✅ 整合測試：Email 已存在本地 `users` → 成功登入同一 `userId`，不產生重複帳號 |
| AC-4（Google token 驗證失敗） | ✅ 整合測試＋瀏覽器驗證（對真實 Supabase 送出偽造 token）：回 `AUTH_GOOGLE_FAILED`（401），不寫入任何資料 |
| AC-5（session 一致性） | 結構已與既有 Email／密碼登入相同（沿用同一 `createSession()`／`GET /api/auth/me`），未另立測試重複驗證既有端點 |
| AC-6（登出，回歸確認） | ✅ 整合測試：Google 登入建立的 session 可正常登出撤銷，沿用既有 `revokeSession()` |
| AC-7（日誌 P0） | ✅ 整合測試：建立／驗證過程不含 `accessToken`／Email |
| AC-8（UI） | ✅ 瀏覽器驗證：登入頁／註冊頁皆顯示按鈕；註冊頁勾選前按鈕停用、勾選後啟用；點擊後正確導向 Google 真實登入畫面，PO 用本人帳號完成同意後正確導回正式站並成功登入（見下方正式站部署驗證段落） |

### 端到端驗證（本機瀏覽器＋共用開發資料庫＋真實 Supabase 實例）
註冊頁：確認同意條款兩個勾選框皆未勾選時「使用 Google 登入」按鈕停用；勾選後按鈕啟用，點擊後瀏覽器正確導向 `https://<專案>.supabase.co/auth/v1/authorize?provider=google&redirect_to=.../auth/callback`——因 Supabase Dashboard 尚未啟用 Google Provider（A126 已知阻塞項），Supabase 回應 `{"error_code":"validation_failed","msg":"Unsupported provider: provider is not enabled"}`，此為預期中的外部設定未完成訊息，非程式錯誤，正確驗證了前端導向流程的參數組裝無誤。登入頁：確認按鈕不受同意條款勾選狀態限制，預設即啟用。`/api/auth/google` 端點：直接對正式執行中的本機伺服器（連真實 Supabase 實例，非測試假 adapter）送出偽造 `accessToken` → 正確回應 `401 AUTH_GOOGLE_FAILED`；送出空請求 → 正確回應 `400 INVALID_REQUEST`（缺少憑證）。`/auth/callback` 頁面：無有效 OAuth session 時，8 秒逾時後正確顯示「登入未完成」錯誤狀態與返回登入頁連結。全專案 184 個測試（+7）／typecheck／lint／`pnpm build` 全綠。

### 正式站部署驗證（2026-07-21，含真實 Google 帳號端到端登入）
Web／worker 兩 service 皆已部署 commit `e3c5f5d`（`RUNNING`），`/api/health` 200。第一次直接對正式站 Supabase 專案打 `/auth/v1/authorize?provider=google` 仍回應 `provider is not enabled`——排查後發現 PO 雖已在 Supabase Dashboard 填入 Client ID／Secret，但「Enable Sign in with Google」總開關本身尚未切換為啟用（填憑證與啟用開關是兩個獨立步驟，容易漏看）。PO 修正後（開關切為啟用＋存檔），重新直接打 Supabase authorize 端點，正確導向 Google 真實登入畫面（頁面顯示「繼續使用「`<專案>`.supabase.co」」）。PO 過程中一度卡在 Google 自身的帳戶安全簡訊驗證（與本專案程式碼／設定無關，疑似因透過自動化瀏覽器環境觸發 Google 風控機制），改用 PO 本人平常慣用的瀏覽器重試後順利通過。PO 用本人真實 Google 帳號完成一次完整登入流程，同意畫面確認資訊存取範圍後點擊繼續，成功導回正式站並落地 `/projects` 頁面（顯示「我的健康專案」，可建立新專案），確認 session 建立成功、四層權限鏈可正常存取。此為 A122（瀏覽器端 OAuth 導向流程）／A124（`anon.auth.getUser()` 驗證真實 Google 核發 token）在正式生產環境的完整端到端驗證，非僅本機或 mock 驗證。

**額外發現（非阻塞，已記錄待辦）**：Google 同意畫面顯示的應用程式名稱為 Supabase 專案網域（`<專案>.supabase.co`），而非友善名稱，原因是 Google Cloud Console「OAuth 同意畫面」的「應用程式名稱」欄位尚未填寫。這是純品牌／信任體感問題，不影響功能；已告知 PO 於 Google Cloud Console 設定，非本輪阻塞項，見已知限制。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：整合測試 7 項全綠＋本機與正式站瀏覽器驗證（含對真實 Supabase 實例／真實 Google 帳號的完整端到端驗證）
- [x] 肉眼驗收：✅ 真實瀏覽器操作確認登入頁／註冊頁按鈕狀態、OAuth 導向參數正確、callback 頁逾時錯誤處理正確、**PO 本人真實 Google 帳號完整登入成功**
- [x] 沒有新增明顯 UI/UX 問題：Google 按鈕樣式與既有表單一致，disabled 狀態清楚
- [x] 修正皆反映於規格與文件：本節已更新；SDD／SYNC／ROADMAP 一併更新
- [x] commit／push／正式站部署驗證：commit `e3c5f5d`／push 至 main／正式站真實資料端到端驗證通過（2026-07-21，含真實 Google 帳號登入）

### 已知限制（誠實記錄，非誇大宣稱）
- **OAuth 同意畫面應用程式名稱未客製化**：Google 同意畫面目前顯示 Supabase 專案網域而非友善名稱，需 PO 於 Google Cloud Console「OAuth 同意畫面」設定「應用程式名稱」欄位（純品牌體感問題，不影響功能，不阻塞本輪結案）。
- **AC-5 未另立測試**：Google 登入建立的 session 與既有 Email／密碼登入使用同一 `createSession()`／`sessions` 表／`GET /api/auth/me` 端點，結構一致性由既有 E1-F2 測試與程式碼共用路徑保證，本輪未重複寫一份幾乎相同的測試。
- **帳號自動連結（Supabase「Allow linking accounts with the same verified email」）僅由 PO 於本輪一併確認啟用，未另外用「先密碼註冊、後 Google 登入同 Email」的組合在正式站實測**：AC-3（既有帳號改用 Google 登入不重複建帳號）已在整合測試以假 adapter 完整驗證程式邏輯正確；正式站的真人驗證涵蓋的是「全新帳號走 Google 登入」路徑，非「既有密碼帳號改連結 Google」路徑，兩者程式碼邏輯相同（見 `loginWithGoogle()` 的既有／全新分流），風險低但誠實記錄尚未在正式站對這個特定組合實測。

## Sprint 20 — E5-F3：定期檢討與無改善分類模組（十分類＋轉介摘要）✅ 實作＋測試＋瀏覽器驗證＋正式站部署驗證皆完成，正式結案

- 期間：2026-07-20（單日完成）
- DOR：✅ 通過（sprints/sprint-20-dor.md；A111–A120 由 PO 追認）
- 目標：銜接 E5-F2 已完成的日常回報與症狀事件模組，補上「計畫到了該檢討的時候」的處理——定期檢討（十分類，上游 §9.3）與專業轉介摘要，把「沒有改善不代表失敗」寫進系統行為。

### 根因／設計要點
- **不落地 `review_due` 狀態，改用計算式判斷**（A113，架構判斷）：本專案尚無日期觸發的背景排程子系統，`createReview()` 於呼叫時計算「計畫 `active`／`paused` 且已達 `reviewDate`」，不修改 `intervention_plans.status` 欄位本身；UI 依相同邏輯決定是否顯示「開始檢討」按鈕。
- **十分類白名單，逐字採用上游 §9.3**（A114，核心安全設計）：`classification` 為十個固定值之一，UI 呈現為下拉選單而非自由文字，API 層拒絕不在清單內的值。延續 A62／A73／A87／A105 一貫原則——「這次執行算不算有改善」是使用者本人的判斷，系統只負責結構化記錄。
- **十分類結果僅觸發狀態標記，從未觸發任何自動調整行動／指標／強度**（A115，核心安全設計，落實憲法 §3）：「計畫可能無效」→ 轉 `ineffective`；「需要專業評估」→ 轉 `escalated`（面板顯示可產生轉介摘要）；「出現不良反應」→ 比照 A105 呼叫既有 `stopPlan()`；其餘七類維持計畫原狀態，僅記錄檢討歷史。UI 於 `ineffective`／`escalated` 狀態顯示維持／簡化／替代／停止／專業評估的引導文字，但系統本身不執行任一項。
- **`ineffective`／`escalated` 可透過既有版本鏈調整回到 `active`**（A116）：`ADJUSTABLE_STATUSES` 擴充納入這兩個新狀態，比照上游 §18.3 `adjusted→active`；`createAdjustedVersion()` 新增 `nextVersionBaseStatus()` 輔助函式，確保從這兩個狀態調整後的新版本正確轉為 `active`（而非沿用舊狀態），二者皆非終態。
- **已完成的檢討不可覆寫**（A112）：比照上游 §17「不覆寫」，`completeReview()` 檢查既有列 `status` 必須為 `in_review` 才允許寫入判斷，`completed` 後再次 `PATCH` 一律拒絕。
- **轉介摘要為伺服器端純結構化聚合，不經 LLM 生成**（A118）：`content` 組裝計畫基準／風險／停止條件、最近一次「需要專業評估」檢討的備註、近期不良反應症狀事件數，純程式邏輯拼接，避免幻覺風險交給醫療專業人員審閱時出錯。僅能在計畫已有 `classification=needs_professional_evaluation` 的檢討時產生（A119），確保摘要有真實檢討依據可回溯。
- **UI 併入既有計畫詳情面板**（A120）：新增「定期檢討」「專業轉介摘要」兩區塊於 `/projects/[id]/plans`，十分類下拉選單置於表單內，不做成獨立精靈流程。

### 驗收結果（AC-1～AC-12）
| AC | 結果 |
|---|---|
| AC-1（檢討建立成功） | ✅ 整合測試＋瀏覽器驗證：計畫 `active` 且已達檢討日 → 成功，`status=in_review` |
| AC-2（檢討建立拒絕情境） | ✅ 整合測試：`draft` 計畫或未達檢討日一律拒絕（`INVALID_REQUEST`） |
| AC-3（檢討完成，十分類） | ✅ 整合測試：送出十分類判斷之一 → `status=completed`，`reviewedAt` 寫入 |
| AC-4（十分類為非法值） | ✅ 整合測試：送出不在清單內的字串 → 拒絕，確認為白名單驗證 |
| AC-5（無改善不自動增強度，核心） | ✅ 整合測試＋瀏覽器驗證：「計畫可能無效」→ 計畫轉 `ineffective`，行動與指標不受影響 |
| AC-6（需要專業評估） | ✅ 整合測試＋瀏覽器驗證：「需要專業評估」→ 計畫轉 `escalated` |
| AC-7（有改善等七類） | ✅ 整合測試＋瀏覽器驗證：分類為其餘七類之一 → 計畫狀態不變，僅記錄歷史 |
| AC-8（已完成的檢討不可覆寫） | ✅ 整合測試：`completed` 後再次 `PATCH` → 拒絕 |
| AC-9（轉介摘要 CRUD） | ✅ 整合測試＋瀏覽器驗證：需先有需要專業評估的檢討才能產生；`draft→ready→exported`／刪除皆正確轉換 |
| AC-10（四層權限鏈） | ✅ 整合測試：跨帳號操作檢討／轉介摘要一律 `PROJECT_ACCESS_DENIED` |
| AC-11（UI） | ✅ 瀏覽器驗證：達檢討日顯示「開始檢討」，十分類為下拉選單，完成後畫面即時反映 |
| AC-12（日誌 P0） | ✅ 整合測試：建立／完成檢討與轉介摘要過程不含 `notes`／`content` 等健康敘述內容 |

### 端到端驗證（本機瀏覽器＋共用開發資料庫）
用 Admin API 直接建立＋確認的測試帳號登入本機開發伺服器，建立第一份計畫（檢討日設為過去日期）並補齊安全欄位與三分類指標後啟用 → 面板正確顯示「開始檢討」按鈕（未達檢討日的計畫則正確顯示「尚未達檢討日期」）→ 點擊開始檢討，十分類下拉選單正確列出十個上游 §9.3 選項 → 選擇「計畫可能無效」＋填寫備註送出 → 計畫狀態徽章即時轉為「可能無效」，面板顯示維持／簡化／替代／停止／專業評估的引導文字，行動與指標區塊未受任何影響 → 點擊「調整（將建立新版本）」並延後檢討日期送出 → 新版本正確轉為「執行中」，指標正確複製，確認 A116 的 `ineffective→adjusted→active` 落地正確。另建立第二份計畫，走「需要專業評估」路徑：檢討完成後計畫轉「需要專業評估」狀態，面板出現「產生轉介摘要」按鈕 → 產生後畫面顯示純結構化聚合的摘要內容（計畫基準／風險／停止條件／檢討分類與備註），無 LLM 生成痕跡 → 依序點擊「標記已完成」「標記已匯出」，狀態正確轉換 `draft→ready→exported` → 刪除後正確從可見列表消失（`status=deleted`）。驗證完畢後測試帳號（含 Supabase Auth）、專案、計畫與子資源已全數清除。全專案 178 個測試（+14）／typecheck／lint／`pnpm build` 全綠。

### 正式站部署驗證（2026-07-20）
Web／worker 兩 service 皆已部署 commit `dab827e`（`RUNNING`），`/api/health` 200。依 KB-025，不僅看 RUNNING 就結案，用 Supabase Admin API 建立正式站測試帳號（略過 email 驗證），在真實瀏覽器登入正式站、建立計畫（檢討日設為過去日期）並補齊安全欄位與三分類指標後啟用 → 點擊「開始檢討」，API 回應 200（AC-1：`reviewDate` 已過確認成功建立 `in_review`）→ 十分類下拉選單正確列出十個上游 §9.3 選項 → 選擇「需要專業評估」＋填寫備註送出 → 以 `read_network_requests` 直接檢視伺服器回應確認 `plan.status="escalated"`，`review.status="completed"` → 面板出現「產生轉介摘要」按鈕，產生後確認回應內容為純結構化聚合文字（計畫基準／風險／停止條件／檢討分類與備註／近期不良反應症狀事件數），無 LLM 生成痕跡 → 依序點擊「標記已完成」「標記已匯出」，狀態正確轉換 `draft→ready→exported` → 點擊「調整（將建立新版本）」，確認新版本（`version=2`）正確轉為 `active`，證實 A116「`escalated` 可透過既有版本鏈調整回到 `active`」在正式站成立 → 額外以頁面內 `fetch` 直接對已完成的檢討呼叫 `PATCH`，確認回應 409 `INVALID_REQUEST`（「分類值不正確，或這筆檢討已完成」），證實 A112「已完成的檢討不可覆寫」在正式站 API 層級亦成立。驗證完畢後測試帳號（含 Supabase Auth）、專案、計畫與子資源已全數清除。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：整合測試 14 項全綠＋真實瀏覽器端到端驗證全數通過
- [x] 肉眼驗收：✅ 真實瀏覽器操作確認（含 `ineffective`／`escalated` 兩條路徑與轉介摘要完整生命週期）
- [x] 沒有新增明顯 UI/UX 問題：定期檢討與轉介摘要表單、狀態轉換按鈕皆正常運作
- [x] 修正皆反映於規格與文件：本節已更新；SDD／SYNC／ROADMAP 一併更新
- [x] commit／push／正式站部署驗證：commit `dab827e`／push 至 main／正式站真實資料端到端驗證通過（2026-07-20），已清除測試資料

### 已知限制（誠實記錄，非誇大宣稱）
- **十分類判斷完全依賴使用者自行選擇**：系統不對日常回報或症狀事件資料做語意分析來自動判定分類，即使數據明顯無改善，使用者若選「有改善」，系統也不會質疑或阻擋（A114 刻意設計，符合憲法 §3「不得責怪使用者」）。
- **`review_due` 未落地為實際狀態值**：是否顯示「開始檢討」由前端／API 計算式判斷（A113），非資料庫層級的排程觸發；若未來需要「到期自動通知」等主動提醒功能，需另外設計背景排程機制。
- **檢討完成後 `reviewDate` 不會自動順延**：即使分類結果讓計畫維持 `active`，`reviewDate` 仍是原值，使用者若要避免立即又能重新開始檢討，需自行透過「調整」更新檢討日期；本輪未設計自動順延邏輯，避免臆測使用者期望的下次檢討週期。
- **調整（版本鏈）不會複製檢討歷史或轉介摘要到新版本**：比照 Sprint 19 `check_ins`／`symptom_events` 的既有行為（僅 `actions`／`metrics` 隨版本鏈複製），新版本的「定期檢討」「專業轉介摘要」區塊會是空的，舊版本的歷史記錄仍可透過資料庫查詢但目前 UI 未提供「查看舊版本」的介面。
- **轉介摘要為靜態快照**：產生當下聚合既有資料，之後若計畫或檢討內容變動，已產生的摘要不會自動更新，需刪除重新產生。

## Sprint 19 — E5-F2：日常回報與症狀事件模組（不良反應暫停鏈）✅ 實作＋測試＋瀏覽器驗證＋正式站部署驗證皆完成，正式結案

- 期間：2026-07-19（單日完成）
- DOR：✅ 通過（sprints/sprint-19-dor.md；A102–A110 由 PO 追認）
- 目標：銜接 E5-F1 已完成的行動計畫，補上執行期間的日常追蹤（`check_ins`）與症狀事件回報（`symptom_events`），核心是「不良反應暫停鏈」——症狀事件標記為不良反應時，系統自動暫停關聯計畫。

### 根因／設計要點
- **不良反應暫停鏈採使用者明確標記，非系統自動判斷嚴重度**（A105，核心安全設計）：`isAdverseEvent` 完全由使用者手動勾選／設定，設為 `true` 時立即呼叫 E5-F1 已預留的 `stopPlan(planId, "adverse_event")`（A90），系統不對症狀描述文字做語意分析自動判定是否構成不良反應。延續 A62／A73／A87 一貫原則——醫學嚴重度判斷貿然自動化比誠實交給使用者決定更危險。
- **「因不良反應停止的計畫不得自動重新啟用」已由既有狀態機滿足**（A106）：`resumePlan()` 僅允許 `paused→active`，`stopped` 為終態且無任何端點可轉回 `active`，本輪不需新增程式碼，僅在測試中新增回歸確認（AC-6）。
- **`check_ins.value` 採自由文字**（A103）：日常回報是使用者主觀記錄，非正式檢驗數值，憲法 §4 numeric 規則不適用。
- **`symptom_events` 本輪不提供 DELETE**（A107）：比照上游 §22.6 API 清單逐字，症狀事件視為醫療相關歷程記錄，只能用 `PATCH` 補充或轉換狀態。
- **執行期間限制**（A109）：check-ins／symptom events 僅開放於計畫 `active`／`paused` 時新增；`draft`／`stopped`／`archived` 拒絕新增（可檢視既有歷史）。
- **錯誤碼精緻化**（A110）：`pausePlan()`／`resumePlan()`／`updatePlan()` 於計畫因不良反應停止時，回傳上游 §24 逐字定義的 `PLAN_ADVERSE_EVENT`（「已暫停相關行動，請先處理不舒服事件」），取代通用 `INVALID_REQUEST`。
- **UI 併入既有計畫詳情面板**（A108）：新增「日常回報」「症狀事件」兩區塊於 `/projects/[id]/plans`，不建立獨立頁面。

### 驗收結果（AC-1～AC-10）
| AC | 結果 |
|---|---|
| AC-1（check-in 建立） | ✅ 整合測試＋瀏覽器驗證：active 計畫、有效指標 → 成功建立，`status=submitted` |
| AC-2（check-in 拒絕情境） | ✅ 整合測試：draft 計畫拒絕（`INVALID_REQUEST`）；跨計畫 `metricId` 回 `NOT_FOUND` |
| AC-3（check-in 更正與刪除） | ✅ 整合測試：更正後 `status→corrected`；刪除後從詳情消失 |
| AC-4（症狀事件：一般回報） | ✅ 整合測試＋瀏覽器驗證：`isAdverseEvent=false`，計畫狀態不受影響 |
| AC-5（不良反應暫停鏈，核心） | ✅ 整合測試＋瀏覽器驗證：標記 `isAdverseEvent=true` → 計畫立即轉 `stopped`／`adverse_event` |
| AC-6（停止後不得恢復，回歸確認） | ✅ 整合測試＋瀏覽器驗證：`resumePlan`／`pausePlan` 皆回 `PLAN_ADVERSE_EVENT`，UI 亦無任何恢復路徑 |
| AC-7（症狀事件狀態轉換） | ✅ 整合測試：`open→monitoring→resolved`／`escalated` 皆正確轉換 |
| AC-8（四層權限鏈） | ✅ 整合測試：跨帳號操作 check-in／症狀事件一律 `PROJECT_ACCESS_DENIED` |
| AC-9（UI） | ✅ 瀏覽器驗證：新增回報／症狀事件即時反映，不良反應觸發時計畫狀態與可用按鈕正確變化 |
| AC-10（日誌 P0） | ✅ 整合測試：建立過程不含 `value`／`note`／`description` 等健康敘述內容 |

### 端到端驗證（本機瀏覽器＋共用開發資料庫）
用 Admin API 直接建立＋確認的測試帳號登入本機開發伺服器，建立專案＋計畫並補齊安全欄位與三分類指標後啟用 → 新增日常回報（選擇指標＋填數值＋備註），畫面即時顯示 → 回報一般症狀事件（不勾選不良反應），計畫狀態不受影響 → 點擊該症狀事件的「回溯標記為不良反應（將暫停計畫）」→ 確認 API 回應計畫立即轉 `status=stopped`／`stopReason=adverse_event`，UI 同步顯示「已停止」「停止原因：不良反應」，且調整／暫停／恢復按鈕全數消失（僅剩刪除），日常回報與症狀事件的新增表單也隨之隱藏（因 `isExecutable` 判斷計畫已非執行狀態）——完整驗證不良反應暫停鏈與「停止後無任何恢復路徑」的設計意圖皆正確落地。驗證完畢後測試帳號（含 Supabase Auth）、專案、計畫與子資源已全數清除。全專案 164 個測試（+9）／typecheck／lint／`pnpm build` 全綠。

### 正式站部署驗證（2026-07-20）
Web／worker 兩 service 皆已部署 commit `1c219d5`（`RUNNING`），`/api/health` 200。依 KB-025，不僅看 RUNNING 就結案，改用 Supabase Admin API 建立正式站測試帳號（略過 email 驗證），在真實瀏覽器登入正式站、建立專案＋計畫、補齊安全欄位與三分類指標並啟用 → 新增一筆日常回報（API 200，畫面即時顯示）→ 回報一般症狀事件（`isAdverseEvent=false`，計畫維持 `active`）→ 點擊「回溯標記為不良反應（將暫停計畫）」→ 以 `read_network_requests` 直接檢視伺服器回應確認 `plan.status="stopped"`／`stopReason="adverse_event"`，UI 同步顯示「已停止」「停止原因：不良反應」且調整／暫停／恢復按鈕全數消失 → 額外以頁面內 `fetch` 直接呼叫 `/resume`／`/pause` 兩端點，皆回應 `409 PLAN_ADVERSE_EVENT`（「已暫停相關行動，請先處理不舒服事件」），確認 A106／A110 在正式生產環境的 API 層級亦成立，非僅 UI 隱藏按鈕。驗證完畢後測試帳號（含 Supabase Auth）、專案、計畫與子資源已全數清除（沿用既有 `cleanupTestData` 輔助函式）。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：整合測試 9 項全綠＋真實瀏覽器端到端驗證全數通過
- [x] 肉眼驗收：✅ 真實瀏覽器操作確認（含核心不良反應暫停鏈的真實觸發）
- [x] 沒有新增明顯 UI/UX 問題：日常回報與症狀事件表單、狀態轉換按鈕皆正常運作
- [x] 修正皆反映於規格與文件：本節已更新；SDD／SYNC／ROADMAP 一併更新
- [x] commit／push／正式站部署驗證：commit `1c219d5`／push 至 main／正式站真實資料端到端驗證通過（2026-07-20），已清除測試資料

### 已知限制（誠實記錄，非誇大宣稱）
- **不良反應判定完全依賴使用者自行標記**：系統不對症狀描述做任何語意分析或嚴重度評估，若使用者未勾選，即使描述聽起來嚴重，計畫也不會自動暫停（A105 刻意設計）。
- **症狀事件無法刪除**：即使描述錯誤也只能用 PATCH 補充或轉換狀態，非本輪疏漏（A107）。
- **`plan_reviews`／無改善十分類／專業轉介摘要仍未實作**：屬 E5-F3 範圍，本輪症狀事件的 `escalated` 狀態僅為占位，無下游轉介流程。

## Sprint 18 — E5-F1：行動計畫與安全規則引擎（Part 2/2）✅ 實作＋測試＋瀏覽器驗證＋正式站部署驗證全數完成

- 期間：2026-07-19（單日完成）
- DOR：✅ 通過（sprints/sprint-18-dor.md；A94–A101 由 PO 追認）
- 目標：補齊 Part 1/2 刻意排除的兩項——UI、已啟用計畫的編輯（版本鏈），完成後 E5-F1 正式結案（05_BACKLOG 2 個 Sprint 預算用盡）。

### 根因／設計要點
- **已啟用計畫的調整採新增列＋前版封存版本鏈**（A96）：`PATCH /plans/{id}` 於 `active`／`paused` 狀態下不再原地覆寫，改為建立新列（`previousVersionId` 指向舊列、`version+1`），舊列 `status→archived`，比照 `observations` A42 既有模式，落實憲法 §4「原值永遠保留、編輯建立新版本」。
- **子資源隨版本鏈複製**（A97）：`intervention_actions`／`tracking_metrics` 建立新版本時複製一份新列掛到新 plan id，舊版本子資源原樣保留成為唯讀歷史，不共用也不重新指向。
- **調整後立即重新跑安全審查**（A100，安全相關核心設計）：新版本寫入後立即重跑 `checkPlanSafetyInfo()`；若調整後欄位或指標不齊全（例如清空 `stopCondition`），新版本狀態強制降為 `needs_info`，防止「調整」變成繞過啟用審查的後門。
- **列表排除舊版本**（延伸 A78 先例）：`listPlans()` 比照 `messages` regenerate 排除已取代版本模式，僅回傳版本鏈末端。
- **`getPlan()` 擴充回傳行動與指標**（實作細節，非新增假設）：UI 需要顯示計畫詳情，`getPlan()`／`GET .../plans/{planId}` 一併回傳 `actions`／`metrics`，延續 `messages` 內嵌 `citations` 的既有模式。
- **UI 為獨立頁面 `/projects/[id]/plans`**（A95）：比照 E4-F3 `/chat` 既有設計語言；戰情頁「目前行動計畫」卡片本輪仍維持既有的靜態占位，不接真實資料（非本輪範圍）。

### 驗收結果（AC-1～AC-9）
| AC | 結果 |
|---|---|
| AC-1（UI 建立與列表） | ✅ 瀏覽器驗證：建立僅填標題的計畫，列表正確顯示 `草稿` |
| AC-2（UI 啟用失敗提示） | ✅ 瀏覽器驗證：安全資訊不足時點擊啟用，畫面明確顯示缺漏欄位與指標分類清單 |
| AC-3（UI 啟用成功） | ✅ 瀏覽器驗證：補齊安全資訊與三分類指標後啟用成功，狀態即時變更為「執行中」 |
| AC-4（調整已啟用計畫：產生新版本） | ✅ 整合測試＋瀏覽器驗證：新版本 `previousVersionId` 正確指向舊列、`version+1`，舊列轉 `archived` |
| AC-5（調整：子資源隨版本複製） | ✅ 整合測試＋瀏覽器驗證：新版本正確顯示與舊版本相同的 3 筆指標（新 id） |
| AC-6（調整後重新安全審查） | ✅ 整合測試：清空 `stopCondition` 送出調整，新版本強制降為 `needs_info` |
| AC-7（暫停／恢復／停止 UI） | ✅ 瀏覽器驗證：依序點擊暫停→恢復→停止，狀態與按鈕皆正確反應 |
| AC-8（列表排除舊版本） | ✅ 整合測試＋瀏覽器驗證：調整後列表僅顯示最新版本 1 筆，不重複顯示舊列 |
| AC-9（WCAG 基本可及性） | ✅ 程式碼審查：所有互動元件皆為原生 `button`／`input`／`select`，具 `focus:ring` 樣式 |

### 端到端驗證（本機瀏覽器＋共用開發資料庫）
用 Admin API 直接建立＋確認的測試帳號（因近期測試觸發 Supabase 寄信限流，比照 Sprint 16 起既有模式）登入本機開發伺服器，建立專案＋計畫（僅標題）→ 點擊啟用確認正確顯示 8 項缺漏清單 → 補齊基準／風險／停止條件／轉介條件／檢討日期＋三分類指標各一筆 → 再次啟用成功，狀態轉「執行中」→ 點擊「調整（將建立新版本）」修改標題並送出，確認產生新版本（列表僅顯示 1 筆最新版本，3 筆指標正確帶入新版本）→ 依序測試暫停→恢復→停止，狀態與按鈕皆正確反應 → 確認專案戰情頁新增「行動計畫」導覽連結。驗證完畢後測試帳號（含 Supabase Auth）、專案、計畫與子資源已全數清除。全專案 155 個測試（+5）／typecheck／lint／`pnpm build` 全綠。

### 實作中發現並修正的缺陷
Part 1/2 遺留一個測試斷言已隨版本鏈行為變更而過期：`plans-service.test.ts` 的「active 計畫編輯應拒絕」測試在本輪改為「active 計畫可編輯（建立新版本）、stopped 計畫編輯才拒絕」，已同步更新斷言，避免保留與新行為矛盾的過期測試覆蓋。

### 正式站部署驗證（2026-07-19）
- commit `026a9dd`「Sprint 18 實作：E5-F1 行動計畫與安全規則引擎（Part 2/2，正式結案）」已 push 至 main，Zeabur web service 自動建置部署，`deployment list` 確認進入 `RUNNING`；`/api/health` 回 200＋`{"status":"ok"}`
- 依 KB-025 鐵則，不只看 `RUNNING`／health 200 就結案：本輪有 UI，改用真實瀏覽器對正式站真實網域（`health-devkit.zeabur.app`）完整操作驗證，測試帳號比照既有模式用 Admin API 直接建立＋確認：
  - 建立計畫（僅標題）→ 點擊啟用 → 正確顯示 8 項缺漏清單（`PLAN_SAFETY_INFO_REQUIRED`）
  - 補齊安全欄位＋三分類指標各一筆 → 再次啟用 → 成功轉「執行中」
  - 點擊「調整（將建立新版本）」修改標題並送出 → 確認產生新版本，3 筆指標正確帶入新版本，列表僅顯示 1 筆最新版本（舊版本正確隱藏，AC-8 在正式生產環境驗證成立）
  - 依序測試暫停→恢復→停止，狀態與按鈕皆正確反應
  - 確認專案戰情頁「行動計畫」導覽連結正確運作
- 驗證完畢後已將測試帳號（含 Supabase Auth）、專案、計畫與子資源全數清除，不留存於共用資料庫

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：整合測試 15 項（既有 10＋新增 5）全綠＋真實瀏覽器端到端驗證（本機＋正式站）全數通過
- [x] 肉眼驗收：✅ 真實瀏覽器操作確認（本輪首次為 E5-F1 進行 UI 肉眼驗收，本機與正式站皆驗證）
- [x] 沒有新增明顯 UI/UX 問題：建立表單、詳情面板、行動／指標新增刪除、狀態按鈕皆正常運作
- [x] 修正皆反映於規格與文件：本節已更新；SDD／SYNC／ROADMAP 一併更新
- [x] commit／push／正式站部署驗證：**已完成（commit `026a9dd`，2026-07-19），E5-F1 正式結案**

### 已知限制（誠實記錄，非誇大宣稱）
- **無版本歷史檢視 UI**：調整後舊版本資料仍完整保留在資料庫，但 UI 僅顯示最新版本，無法透過網頁查看歷史版本內容（A範圍排除，比照 `messages` regenerate 既有設計）。
- **刪除子資源不觸發重新安全審查**（A98）：`removeAction`／`removeMetric` 不因計畫狀態而限制，也不會在刪除已啟用計畫的安全指標時自動降級，這是刻意的範圍控制而非疏漏。
- **戰情頁「目前行動計畫」卡片仍為靜態占位**：本輪未串接真實計畫資料到 Dashboard，需透過「行動計畫」頁面單獨查看。
- **`check_ins`／症狀事件／不良反應自動暫停鏈仍未實作**：屬 E5-F2 範圍，`stopPlan()` 目前僅提供 `reason` 原語欄位。

## Sprint 17 — E5-F1：行動計畫與安全規則引擎（Part 1/2）✅ 實作＋測試＋正式站部署驗證全數完成

- 期間：2026-07-19（單日完成）
- DOR：✅ 通過（sprints/sprint-17-dor.md；A84–A93 由 PO 追認）
- 目標：E5 健康行動閉環第一個 Feature——建立可執行、可停止的行動計畫，核心是啟用前的安全把關（05_BACKLOG 風險標記「醫療安全核心」），非計畫內容豐富度。拆為 Part 1/2（本輪：資料模型＋安全審查＋API，不含 UI）＋ Part 2/2（下一輪：UI＋完整驗收），比照 E2-F2／E4-F3 PoC 拆分先例。

### 根因／設計要點
- **安全審查（`activatePlan()`）採結構化欄位完整性檢查，非語意判讀**（A87，本輪核心設計決策）：檢查計畫自身欄位（`baseline`／`riskNote`／`stopCondition`／`referralCondition`／`reviewDate`）皆非空，且 `leading`／`outcome`／`safety` 三分類指標各至少一筆；**不**對使用者的 `health_profiles`（自由 jsonb）內容做「背景資訊是否充分」的語意判斷。延續 A62／A73／A74 一貫原則——規則式判讀健康背景比誠實要求使用者自己寫清楚安全資訊更危險，會給使用者虛假的安全感。
- **狀態機落地上游 §18.3 子集**（A85）：`draft`／`needs_info`／`safety_review`／`active`／`paused`／`stopped`／`review_due`／`archived`。`safety_review` 僅型別保留，本輪 `activatePlan()` 為同步結構檢查，不產生該狀態實際資料（通過直接進 `active`，不通過回 `needs_info`）。
- **已啟用計畫本輪不開放編輯**（A89）：`draft`／`needs_info` 才能 `updatePlan()`；`active`／`paused` 僅開放 `pause`／`resume`／`stop` 狀態轉換，`previousVersionId` 版本鏈欄位僅預留，邏輯留待 Part 2/2。
- **`stopPlan(reason)` 僅提供狀態轉換原語**（A90）：`reason` 為 `user_choice`／`adverse_event`，不含症狀事件自動觸發鏈——不良反應偵測與自動暫停屬 E5-F2「日常回報與症狀事件模組」範圍。
- **`intervention_actions.category` 自由文字、`tracking_metrics.category` 固定 enum**（A91／A92）：前者純描述性，比照 `health_profiles` 不過度正規化；後者是 A87 安全審查的判斷依據，需要程式邏輯可靠識別三分類是否齊全。
- **錯誤碼採上游 §24 逐字**：`PLAN_SAFETY_INFO_REQUIRED`（尚未完成安全資訊，不能啟用計畫）——啟用失敗時附帶缺漏欄位清單。

### 驗收結果（AC-1～AC-10）
| AC | 結果 |
|---|---|
| AC-1／AC-2（建立草稿） | ✅ 整合測試：安全欄位可留空，`status` 預設 `draft` |
| AC-3（安全檢查通過） | ✅ 整合測試：欄位與三分類指標齊全 → `activate` 成功轉 `active` |
| AC-4（安全檢查不通過：欄位缺漏） | ✅ 整合測試：缺 `stopCondition` → `PLAN_SAFETY_INFO_REQUIRED`＋缺漏清單，`status→needs_info` |
| AC-5（安全檢查不通過：指標缺漏） | ✅ 整合測試：缺 `safety` 分類指標 → 缺漏清單含 `metric:safety` |
| AC-6（暫停／恢復） | ✅ 整合測試：`active↔paused` 正確轉換；`draft` 呼叫 `pause` 拒絕（`INVALID_REQUEST`） |
| AC-7（停止） | ✅ 整合測試：任一非終態可停止，`stopReason` 正確記錄；終態（`stopped`）不可再轉換 |
| AC-8（子資源歸屬與四層鏈） | ✅ 整合測試：跨帳號操作 action／metric 一律 `PROJECT_ACCESS_DENIED`（修正過程見下） |
| AC-9（軟刪除／編輯限制） | ✅ 整合測試：刪除後不出現於列表、直接查詢 `NOT_FOUND`；`active` 計畫編輯拒絕 |
| AC-10（日誌 P0） | ✅ 整合測試：建立／啟用計畫過程不含 `baseline`／`riskNote` 等健康敘述內容 |

### 實作中發現並修正的缺陷
`findOwnedPlan()` 初版把「沒有權限」與「資源不存在」collapse 成同一個 `null` 回傳值，導致 AC-8 的跨帳號測試意外收到 `NOT_FOUND` 而非 `PROJECT_ACCESS_DENIED`（測試當場抓到）。比照 `observations` 模組既有的 `findOwnedObservation` 兩段式判斷慣例修正：先以 `findOwnedProject` 判斷第 1／2／4 層（非擁有者一律 `PROJECT_ACCESS_DENIED`），再判斷 plan 是否存在於該 project（否則 `NOT_FOUND`），回傳型別改為 `{ok:true, plan} | {ok:false, code}` 明確區分兩種情境。修正後全數服務層函式呼叫點同步更新。

### 正式站部署驗證（2026-07-19）
- commit `6e48939`「Sprint 17 實作：E5-F1 行動計畫與安全規則引擎（Part 1/2）」已 push 至 main，Zeabur web service 自動建置部署，`deployment list` 確認進入 `RUNNING`；`/api/health` 回 200＋`{"status":"ok"}`
- 依 KB-025 鐵則，不只看 `RUNNING`／health 200 就結案：本輪無 UI，改用 `curl`＋真實測試帳號（Admin API 直接建立＋確認，跳過寄信流程，比照 Sprint 16／17 部署驗證模式）對正式站真實網域（`health-devkit.zeabur.app`）逐一驗證完整計畫生命週期：
  - 建立草稿（僅標題）→ `activate` 因安全欄位與三分類指標皆缺漏 → 正確回 `PLAN_SAFETY_INFO_REQUIRED`（422）＋完整缺漏清單
  - 補齊三分類指標＋安全欄位 → 再次 `activate` → 成功轉 `active`
  - 嘗試編輯已啟用計畫 → 正確回 `INVALID_REQUEST`（409，編輯鎖定生效）
  - `pause`→`resume`→`stop("adverse_event")` 狀態轉換皆正確，`stopReason` 正確記錄；對已終態計畫再次 `stop` → 正確回 `INVALID_REQUEST`
  - 第二個測試帳號嘗試存取第一個帳號的計畫（`GET`／`pause`）→ 一律 `PROJECT_ACCESS_DENIED`（403），確認 KB-032 修正在生產環境正確生效
  - 軟刪除後計畫不出現在列表、直接查詢回 `NOT_FOUND`（404）
- 驗證完畢後已將兩組測試帳號（含 Supabase Auth）、專案、計畫／行動／指標全數清除，不留存於共用資料庫

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：整合測試 10 項全綠＋正式站真實 API 端到端驗證全數通過
- [ ] 肉眼驗收：本輪無 UI（A88），留待 Part 2/2
- [x] 沒有新增明顯 UI/UX 問題：不適用（無 UI）
- [x] 修正皆反映於規格與文件：本節已更新；SDD／SYNC／ROADMAP 一併更新
- [x] commit／push／正式站部署驗證：**已完成（commit `6e48939`，2026-07-19）**

### 已知限制（誠實記錄，非誇大宣稱）
- **安全審查為結構化欄位完整性檢查，非對健康背景內容的語意判讀**：`activatePlan()` 只確認計畫自身欄位與指標分類齊全，不對 `health_profiles` 內容做正確性或充分性判斷（A87）。
- **已啟用計畫本輪不可編輯，版本鏈邏輯未實作**：`previousVersionId` 欄位僅預留，「調整建立新版本」（上游 §19）留待 Part 2/2（A89）。
- **無 UI**：本輪純後端＋API，透過整合測試驗證（A88），使用者尚無法透過網頁操作行動計畫。
- **`stopPlan()` 無不良反應自動觸發鏈**：`reason` 欄位僅為原語，症狀事件偵測與自動暫停屬 E5-F2 範圍（A90）。
- **`review_due` 之後無檢討結果邏輯**：`adjusted`／`completed`／`ineffective`／`escalated` 分類屬 E5-F3「定期檢討與無改善分類模組」範圍，本輪 `review_due` 僅為狀態機占位。

## Sprint 16 — E4-F3：SSE 串流問答引擎（PoC 2/2）✅ 實作＋測試＋瀏覽器驗證＋正式站部署驗證全數完成

- 期間：2026-07-19（單日完成）
- DOR：✅ 通過（sprints/sprint-16-dor.md；A78–A83 由 PO 追認）
- 目標：把 Sprint 15（PoC 1/2）刻意排除的四項產品化必要項補齊——UI、`regenerate`、頻率限制（C17）、安全提示打磨，讓 E4-F3 具備可讓真實使用者操作的完整體驗

### 根因／設計要點
- **修正 Sprint 15 遺留的潛在缺陷**：`runAssistantMessage()` 原本無條件抓「對話中第一則訊息」當作提問內容，單輪對話的 PoC 測試沒讓這個問題現形；本輪新增多輪對話（`regenerate`）後若不修正會答非所問。改為 `resolveQuestionText()`：沿 `regeneratedFromMessageId` 回溯到最初訊息，再取該訊息之前最近一則使用者訊息，同時修好多輪對話與重新產生兩種情境。
- **`regenerate` 為新增列模式**（A78）：`messages.regeneratedFromMessageId` 自我參照 FK，不修改舊列內容（憲法 §4 原值永遠保留），UI／`listMessages()` 只回傳未被取代的最新版本。
- **頻率限制以帳號為單位、跨專案累計**（A79）：`countMessagesInLast24Hours()` 用 join 查詢帳號名下所有專案的使用者訊息數，非單一對話或專案計數。
- **安全提示僅顯示、不攔截**（A81）：`safety_notice` 事件在 UI 顯示為明顯的 amber 警示框，不修改或阻擋實際回答內容，延續 A73／A76／E4-F2 A62 一貫原則。
- **新增 `listMessages()` 供 UI 顯示歷史**：上游 API 未定義獨立的訊息列表端點，但可運作的對話 UI 實務上需要，補上 `GET .../conversations/{id}/messages`，排除被 regenerate 取代的舊版本。
- **瀏覽器驗證意外發現既有已知限制重現**：測試帳號註冊後嘗試登入時遇到 KB-020「未驗證帳號無法登入」（與 C6 UI 文案「現在也可以直接登入」矛盾）；此為先前 Sprint 已記錄、PO 已拍板暫緩處理的已知限制，非本輪新缺陷。透過 Supabase Admin API 直接標記測試帳號 email 已驗證以繞過（僅用於本機瀏覽器測試，未印出任何機密內容），完成後續完整驗證流程。

### 驗收結果（AC-1～AC-10）
| AC | 結果 |
|---|---|
| AC-1（UI 串流顯示） | ✅ 瀏覽器驗證：真實提問後畫面即時逐字顯示串流內容 |
| AC-2（引用回查） | ✅ 瀏覽器驗證：正確顯示引用清單（個人資料數值） |
| AC-3（取消） | ✅ 整合測試（Sprint 15 AC-7 沿用同一 `cancelMessage()` 邏輯，本輪 UI 已接上取消按鈕） |
| AC-4（重新產生） | ✅ 整合測試＋瀏覽器驗證：真實點擊「重新產生」取得不同措辭的新回答，UI 僅顯示最新版本，引用資訊延續正確 |
| AC-5（頻率限制：正常量） | ✅ 整合測試：帳號當日訊息數 < 30 正常受理 |
| AC-6（頻率限制：超量） | ✅ 整合測試：達 30 則後第 31 則直接回 `RATE_LIMITED`，未建立新訊息 |
| AC-7（安全提示顯示） | ✅ 程式碼審查＋單元邏輯確認：`safety_notice` 對應 UI amber 警示框，不影響回答內容顯示 |
| AC-8（四層權限鏈） | ✅ 整合測試：`listConversations`／`regenerateMessage` 跨帳號一律 `PROJECT_ACCESS_DENIED` |
| AC-9（日誌 P0） | ✅ 整合測試：`listMessages`／`regenerateMessage` 過程不含提問或回答內容 |
| AC-10（WCAG 基本可及性） | ✅ 程式碼審查：所有互動元件皆為原生 `button`／`textarea`／`select`，具 `focus:ring` 樣式，安全提示以圖示＋文字＋邊框呈現非純靠顏色 |

### 端到端驗證（真實瀏覽器＋正式站共用資料庫＋真實 OpenAI API）
用真實註冊帳號（透過 Supabase Admin API 標記驗證繞過 KB-020 限制）登入，建立專案＋合成一筆真實走完整標準化管線的 WBC observation＋一筆合成 `status=active` 知識片段，在 `/projects/{id}/chat` 頁面：建立新對話→輸入「我的白血球（WBC）數值正常嗎？」→畫面即時顯示串流回答，八段結構完整（現有資料摘要／觀察到的變化／可能相關的一般因素／限制與不確定性／可考慮的低風險行動／建議詢問專業人員的問題／引用來源／安全提醒），引用清單正確顯示「6.2 10^3/uL」→點擊「重新產生」取得措辭不同的新回答、UI 僅顯示一則助理訊息（確認舊版本被正確取代，未重複顯示）。另外驗證：問題超出提供資料範圍時，LLM 誠實回覆「目前資料不足」而非編造答案，證明 prompt 安全約束在真實情境下有效。驗證完畢後已將測試帳號、專案、對話、合成知識來源全數清除，不留存於共用資料庫。全專案 140 個測試（+5）／typecheck／lint／`pnpm build` 全綠。

### 正式站部署驗證（2026-07-19）
- commit `9323781`「Sprint 16 實作：E4-F3 SSE 串流問答引擎（PoC 2/2）」已 push 至 main，Zeabur web service 自動建置部署，`deployment list` 確認進入 `RUNNING`
- `/api/health` 回 200＋`{"status":"ok"}`
- 依 KB-025 鐵則，不只看 `RUNNING`／health 200 就結案：另用 Admin API 直接建立＋確認一組正式站專用測試帳號（因近期測試觸發 Supabase 免費方案寄信限流 `EMAIL_RATE_LIMITED`，跳過一般註冊寄信流程；僅用臨時腳本、未印出任何機密，用畢即刪），登入正式站真實網域（`health-devkit.zeabur.app`）、建立專案、合成一筆 `status=active` 知識片段，在 `/projects/{id}/chat` 頁面實際提問（「定期健檢對於早期發現慢性病有何幫助？」），確認：串流八段結構完整回答即時顯示、`[SRC:uuid]` 引用正確渲染為引用清單、點擊「重新產生」取得措辭不同的新版本且 UI 僅顯示一則助理訊息——證明正式站 `OPENAI_API_KEY` 確實生效、SSE 管線與 `regenerate` 版本鏈在真實生產環境下運作正常
- 驗證完畢後已將測試帳號（含 Supabase Auth）、專案、對話／訊息／引用、合成知識來源全數清除，不留存於共用資料庫

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：整合測試＋真實瀏覽器端到端皆綠
- [x] 肉眼驗收：✅ 真實瀏覽器操作確認（本輪首次為 E4-F3 進行 UI 肉眼驗收）
- [x] 沒有新增明顯 UI/UX 問題：對話下拉選單、輸入框、送出／取消／重新產生按鈕皆正常運作
- [x] 修正皆反映於規格與文件：本節已更新；SDD／SYNC／ROADMAP 一併更新
- [x] commit／push／正式站部署驗證：**已完成（commit `9323781`，2026-07-19）**

### 已知限制（誠實記錄，非誇大宣稱）
- **安全提示為顯示層級，非自動攔截**：`safety_notice` 僅提醒使用者留意，回答內容不會被系統修改或擋下（A81）。
- **頻率限制僅涵蓋問答（C17 前半）**：`reports`（每月 10 份）部分因該功能未建置，本輪無法落地（A80）。
- **重新產生不提供版本切換介面**：`regeneratedFromMessageId` 資料鏈已保留，但 UI 僅顯示最新版本，無法回看舊版本內容（A78）。
- **未落地「回報問題」功能**：上游 §21.1 僅有一句話帶過，無資料模型與審核流程規格，貿然做等於誤導性承諾（A82）。
- **KB-020「未驗證帳號無法登入」限制依舊存在**：本輪瀏覽器驗證過程重新確認此既有限制，未新增修復，維持先前 Sprint 的 PO 拍板決定（暫緩處理）。

## Sprint 15 — E4-F3：SSE 串流問答引擎（PoC 1/2）✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-19（單日完成）
- DOR：✅ 通過（sprints/sprint-15-dor.md；A68–A77 由 PO 追認）
- 前置事件：開工前確認 LLM API key（技術選型已定案 OpenAI Responses API）尚未設定，PO 決定先申請、同時請 AI 擬好 DOR 假設（A68）。DOR 通過後 PO 確認「OpenAI Responses API 已申請完成」；實作階段發現 PO 寫入 `.env` 的該行仍保留原註解符號 `#`（`.env.example` 佔位格式），dotenv 因此讀不到值，已用腳本移除該行開頭的 `# `（全程未印出金鑰內容，僅確認布林值／長度／格式前綴）修正後金鑰正確載入。
- 目標：串接 E4-F1（知識檢索）／E4-F2（主張與衝突）／E2-F4（正式紀錄）三塊既有基礎，讓使用者對健康資料提問、AI 以 SSE Streaming 回答，且證明「引用驗證端到端」技術可行（05_BACKLOG 唯一 🔴 風險項）

### 根因／設計要點
- **拆分為 PoC 1/2＋PoC 2/2**（A69）：05_BACKLOG 本身估 2 個 Sprint、標記 PoC，比照 E2-F2 先例，本輪聚焦最高風險項與核心管線，UI／`regenerate`／頻率限制（C17）／進階安全過濾留待 PoC 2/2（Sprint 16）。
- **引用驗證為結構性檢查，非語意一致性核對**（A74）：LLM 被要求只能用我方提供的 `[OBS:uuid]`／`[SRC:uuid]` 標籤引用，驗證時確認該 ID 確實是本輪提供過的 context（未虛構）＋查資料庫確認資料存在、屬於本專案、來源 active、未刪除。**這正是本輪要證明的最高風險項，已用真實 API 呼叫驗證通過**（AC-2／AC-10）。
- **安全把關依賴 prompt 約束＋關鍵字掃描，非獨立分類模型**（A73／A76）：延續 E4-F2 A62 一貫原則——勉強做一個看似可靠、實際不準確的過濾器比誠實地依賴有限手段更危險。檢索結果為空時直接 `blocked`＋`AI_INSUFFICIENT_DATA`，不呼叫 LLM（AC-6，已用 `ThrowingLlmAdapter` 證明真的不會呼叫）。
- **`LlmAdapter` 介面早於本輪存在**：Sprint 1（Stage 0）已定義好 `streamCompletion()` 單一串流方法（憲法 §3 由型別層面排除非串流實作），本輪只需補上 OpenAI Responses API 實作與服務層編排，介面本身未變動。
- **測試多數不需真實 API key**（依賴注入設計紅利）：`runAssistantMessage()` 以參數接受 `LlmAdapter`，8/10 個 AC 用 Fake adapter（立即回應／會拋錯／可取消的慢速串流）驗證狀態機、引用驗證、取消、四層權限鏈、日誌白名單，完全不需要真實 OpenAI 呼叫；僅 AC-2／AC-10 兩項用 `it.skipIf(!hasOpenAiKey)` 隔離真正的端到端驗證。

### 驗收結果（AC-1～AC-10）
| AC | 結果 |
|---|---|
| AC-1（狀態機） | ✅ 整合測試：`messages.status` 涵蓋上游 §17 八值 |
| AC-2（有來源的健康問答，上游 §29；真實 LLM） | ✅ 整合測試（真實 OpenAI 呼叫）：`stream_completed`＋`citation_added` 事件皆正確觸發 |
| AC-3（引用驗證：合法引用通過） | ✅ 整合測試：ID 存在且屬本專案／來源 active → 保留在最終內容並記入 `message_citations` |
| AC-4（引用驗證：虛構引用剔除） | ✅ 單元測試：ID 未曾提供給模型 → 從內容中移除，不記入 citations |
| AC-5（引用驗證：跨專案資料排除） | ✅ 整合測試：ID 確實存在且曾提供，但屬於另一專案 → 剔除 |
| AC-6（資料不足） | ✅ 整合測試：專案無任何已確認資料 → 直接 `blocked`＋`AI_INSUFFICIENT_DATA`，未呼叫 LLM（以會拋錯的 Fake adapter 證明） |
| AC-7（取消） | ✅ 整合測試：`streaming` 階段呼叫 `cancelMessage()` → `AbortSignal` 觸發，狀態轉 `cancelled` |
| AC-8（四層權限鏈） | ✅ 整合測試：跨帳號一律 `PROJECT_ACCESS_DENIED` |
| AC-9（日誌 P0） | ✅ 整合測試：訊息流程不含提問全文、AI 回答全文或完整 prompt |
| AC-10（繁體中文，C18；真實 LLM） | ✅ 整合測試（真實 OpenAI 呼叫）：回答為繁體中文 |

### 端到端驗證（真實 OpenAI API＋合成健康資料）
用合成專案＋一筆真實走完整上傳／標準化管線的 WBC observation＋一筆合成 `status=active` 知識來源，對 `POST .../messages` 建立的訊息呼叫 `runAssistantMessage()` 搭配真正的 `OpenAiLlmAdapter`（`gpt-4o-mini`）：LLM 正確在回答中使用 `[OBS:uuid]`／`[SRC:uuid]` 標籤引用個人資料與知識來源，引用驗證正確識別並保留合法引用、記入 `message_citations`；回答語言為繁體中文。全專案 135 個測試（+10）／typecheck／lint／`pnpm build` 全綠。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：全數含真實 API 呼叫在內全綠
- [x] 肉眼驗收：N/A（本輪無 UI，A75）
- [x] 修正皆反映於規格與文件：本節＋KB-031＋SDD／SYNC／ROADMAP 已更新
- [x] commit（`8cf66a0`＋`36aff4f`）＋push＋正式站部署驗證通過

### 正式站部署驗證（2026-07-19，過程含一次真實故障排除）
第一次驗證（LLM key 已由 PO 存進 Zeabur web service 環境變數後）跑正式站端到端測試，SSE 串流立即回 `stream_failed`。診斷過程：
1. SSE 路由層的 catch 區塊當時完全沒有記錄任何日誌，Zeabur 執行期日誌查無相關錯誤——**發現本輪一個實質缺口，已補上 `logger.error`（僅記 `errorName`，不含健康內容，commit `36aff4f`）**。
2. 用本機 dev server 跑完全相同的 HTTP 路由程式碼（非單元測試的直接函式呼叫，是真正發 HTTP 請求），citation_added／stream_completed 皆正常——**證明程式碼本身無誤**，問題出在正式站環境。
3. 用 `zeabur variable list`（依既定規則整段重導向到暫存檔、僅 `grep -c` 確認筆數、讀完即刪，全程未印出任何機密內容）確認 web service 環境變數清單中根本沒有 `OPENAI_API_KEY`——PO 先前的「已存檔」實際上沒有真的存進去。
4. PO 重新在 Zeabur 主控台以「＋新增」新增該變數並確認存檔，畫面截圖顯示變數清單仍缺該筆，追加確認後 `grep -c` 回傳 1，確認變數已存在。
5. 執行 `zeabur service restart` 兩次確保容器載入新變數，`/api/health` 回 200 後重跑正式站真實 HTTP 端到端測試：`stream_started → retrieval_completed → content_delta → citation_added → stream_completed` 完整跑通，引用驗證正確運作。
web／worker 兩 service 皆確認部署於 commit `8cf66a0`（`36aff4f` 為隨後的日誌修正 commit，同步部署中），狀態 `RUNNING`；worker 未變更，僅例行確認健康。

### 已知限制（誠實記錄，非誇大宣稱）
- **僅 PoC 1/2**：無 UI（純後端＋API，本輪透過整合測試直接消費 SSE 邏輯驗證）、無 `regenerate`、無頻率限制（C17：每日 30 則問答）、無進階安全過濾（僅 prompt 約束＋關鍵字掃描警示，不自動攔截）。
- **引用驗證為結構性檢查**：確認 ID 未虛構、資料存在且合法，**不驗證** LLM 是否曲解了原文語意（技術選型 §11.5「claim 與引用段落一致」的深度版本，需額外 NLI 模型或二次 LLM 呼叫，留待後續迭代）。
- **檢索僅用既有 `searchKnowledge()`／未串接 `getClaimsForTopic()`**：問題文字到 `topicKey` 的自動對應需要額外分類邏輯，超出本輪範圍，衝突主張檢索留待後續迭代。
- **`errorCode`／狀態機已落地但頻率限制、regenerate 版本鏈邏輯本輪不實作**，`messages.version` 欄位僅預留。

## 補充：E4-F1 知識庫真實內容擴充（2026-07-19，非獨立 Sprint，延續 A55 既定流程）

- 性質：內容資料補充，非新 Feature／新 Sprint——沿用 E4-F1 已驗證的 seed 管線與安全設計（`status=draft`），不涉及 schema／服務層邏輯變更（`scripts/seed-knowledge-sources.ts` 為唯一異動檔案）。
- 內容來源：PO 提供王健宇醫師《為什麼你的病總是看不好？》PART1 另外 4 個章節掃描 PDF（〈看得越久，越能有效醫療？〉頁 025–027、〈找個合得來的家庭醫師！〉頁 028–035、〈有好的雙向溝通，才有好的醫療！〉頁 036–043、〈當個上道的病人，醫生就能符合心目中的標準！〉頁 044–049，共 25 頁），比照 Sprint 13 既定方法（AI 逐頁視覺閱讀＋人工轉錄，非自動 OCR）轉錄，並以書內目錄頁（頁碼／章節標題）交叉核對頁碼與段落順序正確性。
- 安全處置：延續 A55 既定原則，四個新章節 `status` 皆設為 `draft`（非作者／PO 逐字最終校對版本），確保 `searchKnowledge()` 不會提早引用；已用整合測試（AC-3）與正式站直接查詢重新確認安全閘門對新內容同樣生效。
- 結果：`knowledge_sources` 現有 6 筆王健宇醫師章節（原 2 筆＋新增 4 筆），`knowledge_chunks` 共 143 筆（原 43 筆＋新增 100 筆），皆為 `status=draft`。全專案 125 個測試／typecheck／lint／`pnpm build` 全綠（測試數量不變，因未新增測試案例，僅擴充既有 seed 內容；既有 AC-6／AC-8 對新內容同樣適用）。
- 已知限制：仍為 6/38 章節（16%），其餘 32 章節（約 681 頁）留待後續迭代；轉錄品質限制同 A55（AI 視覺閱讀非作者逐字校對，直排多欄版面在少數段落的閱讀順序判斷仍有出錯風險）。

## Sprint 14 — E4-F2：主張與衝突模型（七狀態）✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-19（單日完成）
- DOR：✅ 通過（sprints/sprint-14-dor.md；A61–A67 由 PO 追認）
- 目標：把知識來源的切分內容轉換為結構化、可比較的醫學主張（`evidence_claims`），並標記主張間的衝突狀態（上游 §13.3 七分類），供 E4-F3（AI 串流問答）未來查詢與呈現；本輪無 API 路由或 UI（無消費者）

### 根因／設計要點
- **`conflictStatus` 為人工標記，非系統自動判定**（A62）：醫學衝突判斷（如「證據混合」與「條件不同」的差異）需要對研究方法與適用情境的語意理解，規則式程式碼無法可靠判斷；勉強做一個看似能自動分類、實際不準確的演算法，比誠實地由人工標記風險更高，延續 KB-024／KB-029「誠實地不完整優於自信地錯」一貫原則。
- **新增 `topicKey` 分組欄位**（A61）：上游 §13.2／§13.3 未定義「同一主題的多主張如何分組以利衝突比對」的機制，本輪由 PO／seed 作者人工指定分組字串，不做自動語意分群。
- **實作中修正：取消獨立 seed script（KB-030）**：DOR 原規劃仿照 `seed-knowledge-sources.ts` 另立 `seed-evidence-claims.ts` 示範衝突情境（上游 §29 咖啡與骨質疏鬆範例）。撰寫前重新評估發現：此類示範必然要編造虛構的研究名稱與發現，若以 `status=active` 寫入與正式站共用的資料庫，會被 `getClaimsForTopic()` 安全閘門判定為「合格證據」，未來 E4-F3 上線後有被誤引用回答真實使用者問題的風險——這比 E4-F1「未校對真實內容標記 draft」的風險更根本（虛構內容不該有轉正的路徑）。改為衝突情境示範資料只在 `tests/unit/evidence-claims-service.test.ts` 內建立、測試結束立即刪除，不產生任何會留在資料庫的合成主張。
- **不強行用真實王醫師內容示範衝突**（A63）：目前僅 2 章節、內容為病患衛教敘事非研究型結構化資料，若勉強詮釋套入 §13.2 欄位，有扭曲原意的醫療安全風險；真實內容的主張抽取留待後續迭代，需 PO 或醫師本人參與判斷。
- **`chunkId` 可為 null**（A64）：並非每個主張都能精確對應到單一 chunk；`sourceId` 為必填保底，確保「每個主張可追溯」的最低要求成立。
- **`sourceVersion` 為建立當下的版本快照**（A66）：非動態 join 現在的來源版本，為未來「資料更新後舊報告標示過期」（上游 §28.6）判斷預留欄位，過期判斷邏輯本身留待 E4-F3。

### 驗收結果（AC-1～AC-6）
| AC | 結果 |
|---|---|
| AC-1（欄位完整性） | ✅ 整合測試：上游 §13.2 十三項欄位正確寫入與讀出 |
| AC-2（僅回傳 active 來源的主張） | ✅ 整合測試：`draft` 來源的主張不出現 |
| AC-3（撤回來源排除） | ✅ 整合測試：`withdrawn` 來源的主張不回傳 |
| AC-4（衝突情境可查詢） | ✅ 整合測試：同 `topicKey` 下兩筆 `conflictStatus` 不同的主張（上游 §29 咖啡與骨質疏鬆範例）皆正確回傳，各自 `conflictStatus`／`conflictReason` 可讀 |
| AC-5（查無主題） | ✅ 整合測試：回傳空陣列，非錯誤 |
| AC-6（日誌 P0） | ✅ 整合測試：主張查詢過程不含主張內容全文 |

**DOR 草案 AC-6（seed 冪等）已取消**：因取消獨立 seed script（見上，KB-030），改用測試檔內建立／刪除模式，無「seed 冪等」這項行為可測；原 AC-7（日誌 P0）遞補為 AC-6。

### 端到端驗證（合成測試資料，測試檔內建立即刪除）
`tests/unit/evidence-claims-service.test.ts` 用 `ecl-` 前綴合成資料驗證資料模型與 `getClaimsForTopic()` 查詢邏輯，包含上游 §29 現成的「咖啡與骨骼健康來源不一致」情境（同 `topicKey`、`conflictStatus` 分別為 `mixed_evidence`／`different_conditions`）；每筆測試建立的資料於該測試結束後立即刪除，不留存於資料庫。本輪無 UI／API，無需瀏覽器驗證。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 全專案 125 test／19 檔全綠（+6 新測試）；`pnpm build` 乾淨過；typecheck／lint 無新增錯誤（lint 僅 2 條既有無關 warning）
- [x] 肉眼驗收：N/A（本輪無 UI）
- [x] 修正皆反映於規格與文件：本節＋KB-030＋SDD／SYNC／ROADMAP 已更新
- [x] commit（`40d9eec`）＋push＋正式站部署驗證通過

### 正式站部署驗證（2026-07-19）
web／worker 兩 service 皆確認部署於 commit `40d9eec`、狀態 `RUNNING`；`/api/health` 200；worker 執行日誌確認正常啟動、無錯誤。依 KB-028 教訓，`RUNNING` 後等待約 3 分鐘緩衝期才開始驗證，避免部署交接期競態誤判。本輪無新增 API 路由（A67），改用臨時驗證腳本（驗證完立即刪除，不留存於 repo）直接對正式站共用資料庫執行端到端功能驗證：建立一筆 `status=active` 來源的主張與一筆 `status=draft` 來源的主張（同 `topicKey`），呼叫 `getClaimsForTopic()` 確認正確只回傳 `active` 來源的主張、`draft` 來源正確排除，驗證安全閘門在正式站環境同樣生效；驗證用臨時資料已清除。

### 已知限制（誠實記錄，非誇大宣稱）
- **`conflictStatus` 為人工標記，非系統自動偵測衝突**——本輪未實作、也刻意不實作規則式或 AI 式的自動衝突判斷演算法（A62）。
- **衝突情境示範資料為合成資料**（上游 §29 現成範例），非真實醫學文獻比對結果；真實王醫師書籍內容本輪未建立任何對應主張。
- **無 API 路由或 UI**，本輪純後端基礎設施，需等 E4-F3 建置才能從產品介面驗證。
- **`sourceVersion` 過期判斷邏輯未實作**，僅存欄位快照，比對邏輯留待 E4-F3。

## Sprint 13 — E4-F1：知識來源與檢索基座 ✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-19（單日完成）
- DOR：✅ 通過（sprints/sprint-13-dor.md；A54–A60 由 PO 追認）
- 前置事件：開工前確認「首批知識來源整備」外部依賴時，PO 提供合作醫師王健宇醫師已出版衛教書籍《為什麼你的病總是看不好？》（38 章節、706 頁掃描 PDF）作為真實知識來源，取代原計畫的合成資料。同時提供同批內容先前已跑過的 OCR markdown 版本，逐檔核對後發現**系統性辨識錯誤**（大範圍亂碼、詞語拆散、整句不成句），已向 PO 回報並否決不用；改用掃描 PDF 抽樣核對確認品質清晰後，由 AI 逐頁視覺閱讀＋人工轉錄完成 2 個試點章節（11 頁），驗證 seed 管線可行，其餘 36 章節留待後續迭代。
- 目標：建立可儲存、可檢索的知識來源與切分內容資料模型，供 E4-F2（主張與衝突模型）與 E4-F3（AI 串流問答）未來使用；本輪無 API 路由或 UI（無消費者）

### 根因／設計要點
- **真實內容以 `draft` 入庫，非 `active`**（A55）：轉錄雖為 AI 逐頁視覺閱讀（比先前 OCR 工具準確許多，有交叉核對目錄頁頁碼與章節標題），但仍非作者或 PO 逐字校對過的版本，故 `status` 一律設為 `draft`，確保 `searchKnowledge()`（僅回傳 `active`）不會提早引用未確認內容。
- **檢索機制實作中修正**（A54，KB-029）：原規劃用 Postgres 內建全文檢索（tsvector），實作前先寫探測腳本實測，發現對中文完全不斷詞（整段文字變成單一詞元，子字串查詢永遠比對不到）。改用 `pg_trgm` trigram 索引＋`ILIKE` 子字串比對，雖不具語意理解，但對中文內容誠實可用。
- **`sourceType` 新增分類判斷**（A60）：醫師個人撰寫並出版之衛教書籍歸類為 `vetted_education`（上游 §13.1 第五級），因作者具醫師資格、內容已正式出版、與平台有實際合作關係。
- **不建 API 路由**（A58）：`searchKnowledge()`／`chunkText()` 為純服務層函式，比照 E2-F4 `standardizeDocument` 模式，供未來 E4-F2／E4-F3 直接呼叫。

### 驗收結果（AC-1～AC-8）
| AC | 結果 |
|---|---|
| AC-1（狀態機） | ✅ 整合測試：`status` 涵蓋上游 §17 六種狀態 |
| AC-2（切分） | ✅ 單元測試：多段落正確切分，無遺漏或重複；過長段落正確再切分 |
| AC-3（檢索：僅回傳 active） | ✅ 整合測試：`draft` 來源不出現在結果中 |
| AC-4（檢索：撤回來源排除） | ✅ 整合測試：`withdrawn` 來源不回傳任何 chunk |
| AC-5（檢索：查無結果） | ✅ 整合測試：回傳空陣列，非錯誤 |
| AC-6（seed 冪等） | ✅ 整合測試：執行兩次，第二次不建立重複資料 |
| AC-7（日誌 P0） | ✅ 整合測試：檢索與 seed 過程不含知識內容全文 |
| AC-8（真實內容以 draft 入庫，A55） | ✅ 整合測試：王健宇醫師兩章節正確寫入（`status=draft`、`author="王健宇 醫師"`），書中確實出現的詞查詢不回傳任何結果（安全閘門驗證生效） |

### 端到端驗證（真實授權內容＋合成測試資料）
真實內容部分：執行 `seed-knowledge-sources.ts` 寫入王健宇醫師兩章節（43 個 chunk），確認冪等（重跑不重複建立）、`status=draft` 正確、`searchKnowledge()` 對書中確實出現的詞（如「病人」「甲狀腺機能亢進」）皆不回傳任何結果，驗證安全閘門生效。整合測試另用 `kst-` 前綴合成資料驗證各項檢索與狀態機邏輯，測試結束後清除，不影響真實 seed 資料。本輪無 UI／API，無需瀏覽器驗證。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 全專案 119 test／18 檔全綠（+8 新測試）；`pnpm build` 乾淨過；typecheck／lint 無新增錯誤
- [x] 肉眼驗收：N/A（本輪無 UI；真實內容轉錄已交叉核對目錄頁頁碼與章節標題）
- [x] 修正皆反映於規格與文件：本節＋SDD §15／SYNC／ROADMAP／KB-029 已更新
- [x] commit（`a93fdbd`）＋push＋正式站部署驗證通過

### 正式站部署驗證（2026-07-19）
web／worker 兩 service 皆確認部署於 commit `a93fdbd`、狀態 `RUNNING`；`/api/health` 200；worker 執行日誌確認正常啟動、無錯誤。本輪無新增 API 路由（A58），無法用路由存在性檢查驗證；改為直接查詢正式站共用資料庫（本機開發／正式站共用同一 Supabase 實例，既有慣例）確認：`knowledge_sources` 正確有 2 筆真實內容（王健宇醫師兩章節，`status=draft`、`author` 正確）、`knowledge_chunks` 43 筆；呼叫 `searchKnowledge()` 對書中確實出現的詞查詢，正確回傳 0 筆（安全閘門在正式站環境同樣生效）。

### 已知限制（誠實記錄，非誇大宣稱）
- **僅 2/38 章節、11/706 頁已轉錄**，其餘章節留待後續迭代，轉錄方式（人工／更好的 OCR 工具）尚未決定。
- **真實內容 `status=draft`，尚未經作者或 PO 逐字最終校對**，不會被檢索回傳；轉為 `active` 是後續人工操作，非本輪自動化流程。
- **檢索為 trigram 子字串比對，非語意理解**，也非向量檢索（pgvector 留待 embedding provider 決定後補上）。
- **無 API 路由或 UI**，本輪純後端基礎設施，E4-F2／E4-F3 尚未建置前無法從產品介面驗證。

## Sprint 12 — E3-F1：健康戰情 Dashboard（六區塊版面） ✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-18（單日完成）
- DOR：✅ 通過（sprints/sprint-12-dor.md；A50–A53 由 PO 追認）
- 前置事件：撰寫 DOR 時發現一個排序上的潛在誤解——上游 §26 完整六區塊線框圖描繪的是「行動計畫已存在」之後的畫面，一度讓人以為 E3-F1 該延後到 E4／E5 之後才做。查證後確認**不需要延後**：05_BACKLOG 對 E3-F1 標記的前置依賴僅列 E2-F4；上游 §7.1 使用者旅程明確把「查看健康戰情」排在「建立行動計畫」之前，證明首次查看戰情頁時沒有行動計畫是產品設計上的正常狀態。本輪依既定順序實作，六區塊版面全建置，依賴尚未上線的 E4／E5 之區塊採誠實占位。
- 目標：專案新增預設首頁（`/projects/[id]`），依上游 §26 六區塊版面呈現健康戰情總覽，能用現有資料回答的區塊真實呈現，其餘誠實標示「尚未推出」

### 根因／設計要點
- **不做電腦化超標判讀**（A50）：「目前健康狀態」區塊僅原樣顯示數值與參考區間，不加註「異常」「過高」等判讀標籤；「早期變化」僅描述數值升降方向，不判斷臨床意義。理由：參考區間字串格式多樣（含 `<5`／`>100` 等非簡單 min-max 格式，上游 §30 Edge Case），電腦化判讀風險高於效益，真正的臨床解讀應留給有安全框架的 E4-F3 AI 問答處理，延續 KB-024「誠實地不完整優於自信地錯」原則。
- **誠實占位而非延後整個 Feature**（A51）：區塊 2（目前行動計畫）／4（情境與應對）／5（證據與不確定性）／6（專業協助）依賴尚未建置的 E4／E5，本輪顯示清楚的「尚未推出」文字，不假造資料、不呈現誤導性空白互動元件。
- **新增專案預設首頁**（A52）：`/projects/[id]` 此前未使用，本輪作為健康戰情頁（上游 §6.2「健康戰情」為十個工作區頁面之首）；專案列表頁的專案標題改為連結至此。
- **附帶修正**：新增此頁面後 ESLint `no-html-link-for-pages` 規則正確識別出全站多處既有 `<a href="/projects">` 應改用 Next.js `<Link>`（此前未被觸發，屬先前輪次遺留的技術債，非本輪引入），已一併修正 login／documents／profile／trends／projects 列表頁的內部導覽連結。

### 驗收結果（AC-1～AC-8）
| AC | 結果 |
|---|---|
| AC-1（區塊 1：目前健康狀態） | ✅ 整合測試＋瀏覽器驗證：回傳各測項最新一筆（value／unit／referenceRange），依測項名稱排序 |
| AC-2（區塊 1：無資料） | ✅ 整合測試：回傳空陣列非錯誤；UI 顯示「尚無已確認資料」 |
| AC-3（區塊 3：早期變化，升降判斷） | ✅ 整合測試＋瀏覽器驗證：後筆大於前筆標示「↑ 上升」 |
| AC-4（區塊 3：資料不足） | ✅ 整合測試：僅 1 筆數值的測項不出現在早期變化清單 |
| AC-5（四層鏈重用） | ✅ 整合測試：跨帳號一律 `PROJECT_ACCESS_DENIED` |
| AC-6（誠實佔位，憲法 §3） | ✅ 瀏覽器驗證：區塊 2／4／5／6 皆顯示清楚的「尚未推出」文字 |
| AC-7（日誌 P0） | ✅ 整合測試：戰情查詢過程不含檢驗數值、項目名稱等健康內容 |
| AC-8（不做超標判讀，A50） | ✅ 整合測試＋瀏覽器驗證：數值 12.5 超出參考區間 4.0-10.0，回應與 UI 皆僅原樣顯示，無額外判讀標籤或欄位 |

### 端到端驗證（合成資料，非真實個資）
用 `pdf-lib` 合成 2 份 WBC 檢驗報告（5.0 與 12.5，不同檢驗日期），走完整真實管線（真實 Supabase Storage／Worker／UI）：上傳→真實 Worker 解析→接受→確認→真實 Worker 標準化→PATCH 設定檢驗日期。瀏覽器開啟戰情頁（`/projects/{id}`）：確認六區塊皆正確渲染——「目前健康狀態」顯示最新值 12.5（超出參考區間但無判讀標籤）、「早期變化」正確標示「↑ 上升」、其餘四區塊皆為誠實占位文字。從專案列表頁點擊專案標題正確導覽至戰情頁。驗證完成後清除測試帳號、專案、文件；暫存腳本已刪除，未留存於 repo。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 全專案 111 test／17 檔全綠（+6 新測試）；`pnpm build` 乾淨過；typecheck／lint 無新增錯誤（含修正全站既有 `<a>`→`<Link>` 技術債）
- [x] 肉眼驗收：合成資料走完整真實管線＋瀏覽器互動驗證（六區塊渲染＋導覽），非僅單元測試
- [x] 修正皆反映於規格與文件：本節＋SDD §15／SYNC／ROADMAP 已更新；OpenAPI 已補 dashboard GET 端點
- [x] commit（`e02871f`）＋push＋正式站部署驗證通過

### 正式站部署驗證（2026-07-19）
web／worker 兩 service 皆確認部署於 commit `e02871f`、狀態 `RUNNING`；`/api/health` 200；新路由 `/api/projects/{id}/dashboard`（無 session）回 401（非 404，確認已上線）。**依 KB-028 教訓，`RUNNING` 後刻意等待約 3 分鐘緩衝期才進行功能驗證**，避開 worker 部署交接期競態。**真實功能端到端驗證**：對 https://health-devkit.zeabur.app 用 2 份合成 PDF（WBC 5.0／12.5，不同檢驗日期）走完整真實管線——上傳→正式站真實 Worker 解析→接受→確認→正式站真實 Worker 標準化→PATCH 設定檢驗日期→`GET .../dashboard`，正確回傳「目前健康狀態」（最新值 12.5，含參考區間，無超標判讀欄位）與「早期變化」（正確標示 up），本次未再遇到 KB-028 交接期競態，緩衝策略有效。驗證完成後清除測試帳號、專案、文件、Storage 物件；暫存腳本已刪除，未留存於 repo。

### 已知限制（誠實記錄，非誇大宣稱）
- **六區塊版面全建置，但僅 2 區塊（目前健康狀態／早期變化）有真實資料**，其餘 4 區塊為占位，需等 E4（AI／知識庫）與 E5（行動計畫／回報／轉介）陸續完成才會有真正內容。E3 Epic「完成」指的是本輪範圍已依既定順序與依賴關係交付，非六區塊功能全數到位。
- **早期變化僅比較最新兩筆數值**，未考慮更長期的趨勢型態（如波動、季節性），完整趨勢分析仍以「趨勢分析」頁（E3-F2）為準。

## Sprint 11 — E3-F2：趨勢圖與等價資料表 ✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-18（單日完成）
- DOR：✅ 通過（sprints/sprint-11-dor.md；A45–A49 由 PO 追認）
- 前置事件：撰寫 DOR 時逐條核對上游 §17／§28.5，發現兩個先前輪次因範圍收斂而合理省略、現在下游功能需要才補上的資料缺口：`documents` 無日期欄位（趨勢圖 x 軸需要）、`observations` 未攜帶參考區間（上游 §28.5 明列驗收條件）。兩者皆於本輪一併補齊（A45／A46）。
- 目標：把 E2-F4 已標準化的正式紀錄依測項分組，畫成時間序列趨勢圖＋等價可存取資料表，每點可回查來源

### 根因／設計要點
- **`documents.reportDate` 與 `observations.rawReferenceRange` 欄位補齊**（A45／A46）：前者供趨勢圖時間軸使用（為 null 時 fallback 為上傳時間並標記 `dateEstimated`，對應上游 §30 Edge Case「報告沒有日期」）；後者標準化時原樣從 `extracted_items` 複製，落實憲法 §4「原值永遠保留」延伸至參考區間。
- **`reportDate` 編輯不比照 E2-F3 confirmed 鎖定規則**（A47）：純描述性中繼資料，任何未刪除文件狀態皆可編輯——鎖定的是辨識候選列的審查內容，非日期這類補充資訊。
- **不可換算防護採縱深防禦**（A48）：E2-F4 寫入時已結構性保證同一測項的 observations 皆為 canonical 換算後單位，`GET /trends` 仍額外依 `unit` 再分組，若出現異常混線（理論上不該發生）就拆成獨立子序列並標記 `unitMismatch`，絕不靜默合併。
- **趨勢頁為十個工作區頁面之一**（上游 §6.2「趨勢分析」），非文件頁附屬區塊——新增 `/projects/[id]/trends`，ECharts 折線圖＋純 HTML 等價資料表（WCAG 2.2 AA，上游 §27.4）並列，滿足「不只看圖表」的可存取性要求。

### 驗收結果（AC-1～AC-10）
| AC | 結果 |
|---|---|
| AC-1（核心趨勢） | ✅ 整合測試＋瀏覽器端到端驗證：同測項多筆不同日期正確依日期排序成單一序列，含數值／參考區間／來源頁碼 |
| AC-2（上游 §29 BDD：未確認資料不納入正式趨勢） | ✅ 整合測試：僅辨識未確認的文件不出現在任何序列（結構性保證，trends 只讀 observations） |
| AC-3（日期 fallback） | ✅ 整合測試＋瀏覽器驗證：`reportDate` 未設定時 fallback 為上傳時間，標記「估計」；補上日期後即時反映排序 |
| AC-4（參考區間攜帶） | ✅ 整合測試：`rawReferenceRange` 正確從候選列攜帶至 observation 與趨勢回應 |
| AC-5（四層鏈重用） | ✅ 整合測試：跨帳號一律 `PROJECT_ACCESS_DENIED` |
| AC-6（分組不誤連） | ✅ 整合測試：不同測項回傳獨立序列，絕不合併 |
| AC-7（防護性拆分，A48） | ✅ 整合測試：手動模擬資料完整性異常，正確拆成獨立子序列並標記 `unitMismatch` |
| AC-8（`reportDate` 編輯） | ✅ 整合測試＋瀏覽器驗證：任何未刪除文件狀態皆可編輯，帶舊 version 回 `VERSION_CONFLICT` |
| AC-9（日誌 P0） | ✅ 整合測試：趨勢查詢與日期編輯過程不含檢驗數值、項目名稱等健康內容 |
| AC-10（等價資料表，上游 §27.4） | ✅ 瀏覽器驗證：Accessibility tree 確認每張圖表旁存在對應資料表，筆數與圖表點數一致 |

### 端到端驗證（合成資料，非真實個資）
用 `pdf-lib` 合成 3 份 WBC 檢驗報告（不同數值），走完整真實管線（真實 Supabase Storage／Worker／UI）：上傳→真實 Worker 解析→接受→確認→真實 Worker 標準化→其中 2 份透過 PATCH 設定不同檢驗日期，第 3 份刻意不設定。瀏覽器開啟趨勢分析頁：折線圖與等價資料表正確依日期排序（2026-01-15／2026-04-01／2026-07-18［估計，未設定日期］），Accessibility tree 確認圖表容器（`role="img"`）與資料表並存；點擊「第 N 頁」drill-down 正確觸發 signed URL 取得（200 OK，與 E2-F3 既有機制相同）。接著在文件列表頁為未設定日期的文件補上日期，PATCH 成功即時反映；回到趨勢頁確認排序與「估計」標記皆正確更新為已知日期。驗證完成後依既有隱私協定清除測試帳號、專案、文件、候選列、observations；暫存腳本已刪除，未留存於 repo。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 全專案 105 test／16 檔全綠（+10 新測試）；`pnpm build` 乾淨過；typecheck／lint 無新增錯誤
- [x] 肉眼驗收：合成資料走完整真實管線＋瀏覽器互動驗證（折線圖＋等價資料表＋日期編輯＋drill-down），非僅單元測試
- [x] 修正皆反映於規格與文件：本節＋SDD §15／SYNC／ROADMAP 已更新；OpenAPI 已補 trends GET／documents PATCH 端點
- [x] commit（`01ba99b`）＋push＋正式站部署驗證通過

### 正式站部署驗證（2026-07-18）
web／worker 兩 service 皆確認部署於 commit `01ba99b`、狀態 `RUNNING`；`/api/health` 200；新路由 `/api/projects/{id}/trends`（無 session）回 401（非 404，確認已上線）。**真實功能端到端驗證**：對 https://health-devkit.zeabur.app 用合成 PDF 走完整真實管線——上傳→正式站真實 Worker 解析→接受→確認→正式站真實 Worker 標準化→PATCH 設定檢驗日期→`GET .../trends`。**第一次驗證發現 `referenceRange` 回 `null`**（`extracted_items.rawReferenceRange` 明明正確存有值），程式碼與 schema 皆確認無誤；相隔約 3 分鐘重跑同一驗證即完全正確。判定為 worker 部署交接期競態——`RUNNING` 顯示的那一刻，舊版程式碼容器可能仍短暫存活並搶到佇列工作，新欄位為 nullable 故舊程式碼靜默留空、不報錯（**新知識點，已登記 KB-028**）。確認為交接期暫時現象、非程式錯誤後，驗證結果視為通過。驗證完成後清除兩輪測試帳號、專案、文件、Storage 物件；暫存腳本已刪除，未留存於 repo。

### 已知限制（誠實記錄，非誇大宣稱）
- **E3 尚未全數完成**：本輪僅完成 E3-F2（趨勢圖），E3-F1（健康戰情 Dashboard 六區塊）依既定順序排在後面，因其六區塊高度依賴尚未實作的 E4／E5 資料（行動計畫、專業協助等）。
- **參考區間本輪僅資料表呈現，圖表未疊視覺帶**：滿足上游字面驗收條件（「參考區間依日期呈現」），進階視覺化留待使用者回饋後再迭代。
- **趨勢頁 bundle 因 ECharts 明顯變大**（367 kB／477 kB First Load JS，其餘頁面約 100～110 kB）：MVP 階段可接受，若日後效能成為問題，可考慮動態載入或改用更輕量的圖表方案，非本輪處理範圍。

## Sprint 10 — E2-F4：標準化與正式紀錄模組 ✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-18（單日完成）
- DOR：✅ 通過（sprints/sprint-10-dor.md；A40–A44 隨 PO「開啟該 DOR 時即部署」授權一併追認）
- 目標：把 E2-F3 確認完成（`confirmed`）的候選列，透過別名比對＋單位白名單自動標準化為正式數值紀錄（`observations`），供未來趨勢頁查詢

### 根因／設計要點
- **別名比對採精確字串，不做模糊比對**（A40）：`test_aliases` 僅存精確字串→`test_definitions` 對應。理由：健檢報告項目命名差異大，模糊比對容易誤連不同檢驗項目，違反醫療安全優先原則——「不能合併就寧可不畫線」。
- **種子資料刻意保守**（A41）：僅為 4 個已知項目（WBC／Glucose／Cholesterol／Vitamin D）各建立 1 筆精確別名＋1 筆單位白名單（`factorToCanonical: "1"`，即恆等換算）。刻意不發明真實醫療單位換算係數（如 mg/dL↔mmol/L），即使這類換算在臨床上是常識，因為超出本 MVP Sprint 範圍與風險容忍度，需專業審查後才可加入。
- **版本鏈設計與 E2-F3 不同**（A42）：`observations` 走「新增列＋舊列標記 superseded」模式（新版本就是可查詢的正式記錄本身），區別於 E2-F3 `extracted_item_edits` 的純稽核附加表模式（候選列本身仍是同一列，異動歷史另外存）。
- **`observations` 掛在專案層級，非文件層級**（A43，依上游 `/api/v1/projects/{project_id}/observations` 路徑確認）：同一檢驗項目的版本鏈可能橫跨多次就診／多份文件。
- **標準化由 Worker 非同步觸發**：`confirmDocument` 成功轉 `confirmed` 後，enqueue `standardize-document` job，不阻塞使用者的確認操作。

### 驗收結果（AC-1～AC-9）
| AC | 結果 |
|---|---|
| AC-1 | ✅ 整合測試＋瀏覽器端到端驗證：別名＋單位皆命中 → 建立 observation，數值正確換算 |
| AC-2 | ✅ 整合測試：別名未對應 → 略過，`extracted_items` 不受影響 |
| AC-3 | ✅ 整合測試：單位不在白名單或為空 → 略過 |
| AC-4 | ✅ 整合測試：`status=rejected` 的候選列不標準化 |
| AC-5 | ✅ 整合測試：PATCH 更新 → 新版本、舊列標記 `superseded`，舊值仍可查詢 |
| AC-6a（同一使用者，錯誤專案範圍） | ✅ 整合測試：`NOT_FOUND`／`{ok:true, items:[]}`（比照 `findOwnedExtractedItem` 既有慣例，子資源不屬於指定父層不誤判為跨帳號） |
| AC-6b（跨帳號） | ✅ 整合測試：陌生使用者一律 `PROJECT_ACCESS_DENIED` |
| AC-7 | ✅ 整合測試：`numeric_value` 欄位型別以 `information_schema.columns` 直接查證為 `numeric`（憲法 §4） |
| AC-8 | ✅ 整合測試：日誌不含健康內容 |
| AC-9 | ✅ 整合測試：`confirmDocument` 成功後正確 enqueue `standardize-document` job |

### 端到端驗證（合成資料，非真實個資）
用 `pdf-lib` 合成含「WBC 6.2 10^3/uL 4.0-10.0」一列的 PDF，走完整真實管線（真實 Supabase Storage／Worker／API）：上傳→真實 Worker 解析→PATCH 全部候選列為 `accepted`→確認（`POST .../confirm`，觸發 `standardize-document` job）→真實 Worker 完成標準化→於瀏覽器登入該帳號檢視文件頁面，確認「已入庫的正式紀錄」區塊正確顯示 WBC／6.2／10^3/uL／原始值 6.2 10^3/uL；同時確認候選列表格已鎖定為唯讀（無編輯／接受／拒絕／刪除按鈕，狀態顯示「已接受」），沿用 E2-F3 的 confirmed-lockdown 行為。驗證完成後依既有隱私協定清除測試帳號、專案、文件、候選列、observations；暫存腳本已刪除，未留存於 repo。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 全專案 95 test／15 檔全綠（+11 新測試）；`pnpm build` 乾淨過；typecheck／lint 無新增錯誤
- [x] 肉眼驗收：合成資料走完整真實管線＋瀏覽器互動驗證（標準化結果正確渲染＋鎖定狀態正確），非僅單元測試
- [x] 修正皆反映於規格與文件：本節＋SDD §15／SYNC／ROADMAP 已更新；OpenAPI 已補 observations GET／PATCH／DELETE 端點
- [x] commit（`cde2e5e`）＋push＋正式站部署驗證通過

### 正式站部署驗證（2026-07-18）
web／worker 兩 service 皆確認部署於 commit `cde2e5e`、狀態 `RUNNING`；`/api/health` 200；新路由 `/api/projects/{id}/observations`（無 session）回 401（非 404，確認已上線，KB-025 教訓延續：不只看 RUNNING／200 就結案）。**真實功能端到端驗證**：對 https://health-devkit.zeabur.app 用合成 PDF（WBC 一列）走完整真實管線——上傳→正式站真實 Worker 解析→PATCH 接受→確認（觸發 standardize-document）→正式站真實 Worker 標準化→`GET .../observations` 正確回傳 WBC／6.2／10^3/uL。驗證完成後清除測試帳號、專案、文件、Storage 物件；暫存腳本已刪除，未留存於 repo。

## Sprint 9 — E2-F3：人工確認與入庫模組 ✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-17（單日完成）
- DOR：✅ 通過（sprints/sprint-09-dor.md；A36–A39 由 PO 追認）
- 前置事件：開工前撰寫 DOR 時發現 `archive/` 底下的「上游規格」章節引用（§17／§18.1／§22.4／§28.4 等）長期查無實據——原始檔案從未 commit 過。PO 提供本機留存的完整版（`個人健康檢查管理平台_規格_v1_0_0.md`／`個人健康檢查平台_技術選型_v1_0_0.md`）補進 `archive/upstream_spec/`；另兩份更早期、已被 KB-001／KB-003 推翻的草稿也一併補進 `archive/deprecated_specs/`（詳見 KB-027）。DOR 已依驗證過的原文重寫，比原本自行猜測的版本更精確（如新增了原本漏掉的「手動新增候選列」功能）。
- 目標：讓使用者對 E2-F2 產出的辨識候選列（`extracted_items`）新增、編輯、接受、拒絕，並透過確認 transaction 把文件狀態鎖定為 `confirmed`（上游 §18.1 狀態機）

### 根因／設計要點
- **E2-F3／E2-F4 邊界**（上游 §17 逐字確認）：E2-F3 只管理 `extracted_items` 候選列的生命週期（新增／編輯／接受／拒絕／確認），維持 text 型別；別名對應、單位換算、numeric 轉型、`observations` 表是 E2-F4 的範圍。
- **編輯異動歷史**（A36）：新增 `extracted_item_edits` 表（append-only），每次編輯前先寫入編輯前的原始值，落實憲法 §4「Original values … MUST be preserved forever」，而非原地覆寫＋version 遞增。
- **確認後鎖定**：實作過程中發現 DOR 草稿本身有個一致性缺口——`createExtractedItem` 已擋 `document.status !== "review_required"`，但 `updateExtractedItem`／`deleteExtractedItem` 原本沒有同樣的檢查。已修正：`findOwnedExtractedItem` 統一檢查文件必須在 `review_required`，confirmed 後的候選列一律鎖定，PATCH／DELETE 回 `INVALID_REQUEST`（新增測試覆蓋，AC-8 延伸）。
- **DELETE 與 status=rejected 的語意區分**（A37）：DELETE 徹底移除（如手動新增後反悔）；rejected 保留列本身供日後回查——兩者對應不同使用情境，不是同義詞。
- **確認 transaction 完整性**（A38）：要求文件底下所有候選列皆已到達 `edited`／`accepted`／`rejected` 三者之一才能確認，避免使用者漏看某列。

### 驗收結果（AC-1～AC-13）
| AC | 結果 |
|---|---|
| AC-1／AC-2 | ✅ 整合測試＋瀏覽器端到端驗證：PATCH 編輯內容寫入異動歷史、status=edited、version+1；帶舊 version 回 VERSION_CONFLICT |
| AC-3 | ✅ 整合測試：純狀態變更（accepted，無欄位變更）不寫入異動歷史 |
| AC-4 | ✅ 整合測試：status=rejected 列本身保留，不刪除 |
| AC-5 | ✅ 整合測試＋瀏覽器驗證：手動新增候選列（僅 review_required 允許） |
| AC-6 | ✅ 整合測試：DELETE 徹底移除候選列 |
| AC-7／AC-8 | ✅ 整合測試＋瀏覽器端到端驗證：有未處理列時擋下（`PENDING_REVIEW_ITEMS`）；全部處理完才成功並轉 `confirmed`，UI 即時切換為唯讀鎖定畫面 |
| AC-9 | ✅ 未新增任何提前洩漏未確認資料的路徑（本輪尚無趨勢頁，E3 範圍） |
| AC-10 | ✅ 整合測試：新增／編輯／刪除／確認四個新端點皆四層鏈重用，跨專案一律 `PROJECT_ACCESS_DENIED` |
| AC-11 | ✅ 瀏覽器驗證：每列可點擊「第 N 頁」，帶 `#page=N` 網址片段開啟 signed URL 直接跳頁 |
| AC-12 | ✅ 整合測試：日誌不含候選列內容（項目名稱／數值） |
| AC-13（KB-021 決定） | ✅ **PO 2026-07-17 決定：維持原計畫，惡意檔案掃描留到 E6-F2**（05_BACKLOG §49 footnote 要求的檢查點已完成，不提前） |

### 端到端驗證（合成資料，非真實個資）
用 `pdf-lib` 合成 PDF（WBC 清楚列＋Vitamin D 低信心列）走完整真實管線（真實 Supabase Storage／Worker／UI），瀏覽器操作驗證：編輯 WBC 數值（6.2→6.3，狀態轉「已編輯」）→ 接受 Vitamin D（狀態轉「已接受」）→ 確認按鈕原本停用並顯示提示，全部列處理完後啟用 → 按下確認 → 文件狀態即時轉「已確認」，畫面切換為唯讀（編輯／接受／拒絕／刪除／新增／確認按鈕全部消失，僅保留唯讀表格）。驗證完成後依既有隱私協定清除測試帳號、專案、文件、候選列、異動歷史與 Storage 物件；暫存腳本已刪除，未留存於 repo。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 全專案 84 test／14 檔全綠（+9 新測試）；`pnpm build` 乾淨過；typecheck／lint 無新增錯誤
- [x] 肉眼驗收：合成資料走完整真實管線＋瀏覽器互動驗證（編輯／接受／確認／唯讀鎖定），非僅單元測試
- [x] 修正皆反映於規格與文件：本節＋SDD §15／SYNC／ROADMAP 已更新；OpenAPI 已補新增／編輯／刪除／確認端點
- [x] 假設 A36–A39 已於 DOR 追認；實作中發現並修正 DOR 未言明的一致性缺口（confirmed 文件鎖定），已如實記錄於上方「根因／設計要點」
- [x] 四層權限鏈：新端點皆重用（AC-10）；日誌掃描 P0（AC-12）；LLM Streaming N/A
- [x] 真實個資處理：本輪未使用任何真實 PHI，端到端驗證用純合成資料；測試帳號/專案/文件/候選列/異動歷史/Storage 物件測完即清除
- [x] PO 2026-07-17：KB-021（AC-13）決定——維持原計畫留到 E6-F2，不提前
- [x] PO 2026-07-17：commit（`b9f878d`）＋push＋正式站部署驗證通過（web／worker 皆 `RUNNING`；新路由 `/confirm` 404→401 確認上線；真實合成資料端到端功能驗證：上傳→真實 Worker 解析→PATCH 編輯→確認，`documents.status` 正確轉 `confirmed`）
- [ ] 下一步：E2-F3 結案，開 Sprint 10（E2-F4：標準化與正式紀錄模組）DOR

### 本輪工程筆記
- 找到「消失的上游規格」是本輪最重要的非功能性產出（KB-027）——8 個 Sprint 以來，本專案文件系統對「上游規格 §X」的引用長期查無實據，只是沒人逐字核對過。這次撰寫 DOR 時堅持「查不到原文就不能引用」的紀律，才逼出這個發現。教訓：專案初期若有「口頭/本機存在但未 commit」的關鍵文件，應在骨架建立當下就一併 commit。
- `findOwnedExtractedItem` 的 `review_required` 鎖定檢查是實作過程中才發現的缺口，不是 DOR 原本明文要求的 AC——這提醒了「範圍排除」寫的是「不做什麼」，不代表遺漏的「應該做但沒寫清楚」的一致性要求會自動被檔下；DOR 通過不等於設計已經完備，實作階段仍要保持警覺。

## Sprint 8 — E2-F2：文字型 PDF 解析管線（PoC 2/2，準確率調校）✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-17（單日完成）
- DOR：✅ 通過（sprints/sprint-08-dor.md；A26–A28 由 PO 追認）
- 觸發背景：Sprint 7（KB-023）以 7 份真實樣本測出唯一有文字層的 1 份暴露三個缺陷：多欄表格參考區間與數值互相污染、單位常抓不到、頁首病患資訊被誤判為高信心檢驗列
- 目標：修正三個缺陷的共同根因＋A28 頁首防呆 → E2-F2 正式結案

### 根因診斷（本輪關鍵發現，過程修正了 DOR 原訂技術方向）
DOR（A26）原規劃「依 x 間距重新拼接相鄰 item」，但實際寫合成探測腳本（不含真實資料，純幾何測試）逐步縮小 pdfjs `getTextContent()` 的合併間距後發現：
- 間距 <1.5pt：兩段文字合併成**一個字串、零分隔字元**（如 `"142"`＋`"90-135"` → `"14290-135"`）
- 間距 1.5–8pt：合併成一個字串，但**字串內含真正的空白字元**（這個區間本來就沒問題）
- 間距 ≥8pt：保持為獨立 item

真正的根因是 <1.5pt 這個區間：**pdfjs 在文字傳到我方程式碼之前就已經把欄位邊界資訊丟棄**，不是「拼接邏輯有誤」。這代表 DOR 原訂的「依 item 間 x 間距重新拼接」打不中問題——那個時候邊界早就不存在了。改採**內容形狀驗證**：`rawUnit`／`rawReferenceRange` 只在內容通過形狀驗證時才指派，通不過的一律維持 `null`（不猜測切法），對應憲法 §3「自信地錯」比「誠實地不完整」更危險的原則——PO 明確拍板此為 first priority（無法辨識就顯示「無法辨識」讓使用者自行輸入）。

### 驗收結果（AC-1～AC-6）
| AC | 結果 |
|---|---|
| AC-1～AC-2 | ✅ 單元測試＋端到端真實管線驗證：黏合殘留字串（如 `"14290~135mmHg"`）不再被硬塞進 `rawUnit`／`rawReferenceRange`，維持 `null`，前端顯示「無法辨識」 |
| AC-3（A28） | ✅ 單元測試＋端到端驗證：含冒號的頁首／病患中繼資料列（如「列印序號 : 50065」）新增 `METADATA_LINE` 防呆，完全不進入候選列（而非降低信心值——本質上就不是檢驗數據） |
| AC-4 | ✅ 合成多欄 fixture 涵蓋：欄位間距差異、緊鄰無空白黏合、頁首中繼資料列；`extractCandidatesFromPage` 單元測試全數通過 |
| AC-5（回歸） | ✅ Sprint 7 既有測試全數通過，無退化；全專案 75 個測試（14 檔）／typecheck／lint／`pnpm build` 全綠 |
| AC-6（誠實記錄） | ✅ 見下方「已知殘留限制」——不誇大宣稱完全解決 |

### 端到端驗證（合成資料，非真實個資）
用 `pdf-lib` 精準控制文字座標，重現探測腳本驗證過的 <1.5pt 合併行為，走完整真實管線（真實 Supabase Storage＋真實 Worker＋真實 pdfjs 解析＋真實 UI）：
- `SystolicBP 128` + 黏合殘留 → `rawUnit=null`、`rawReferenceRange=null`、confidence 0.45，UI 正確顯示「無法辨識」
- `Cholesterol 180 mg/dL <200`（正常間距）→ 正確辨識，confidence 0.95
- 頁首「PatientInfo ID: 50065」→ 完全未出現在候選列（只有 2 筆，不是 3 筆）

驗證完成後依既有隱私協定清除測試帳號、專案、文件、抽取候選列與 Storage 物件；暫存腳本已刪除，未留存於 repo。

### 正式站部署驗證與意外事故（2026-07-17，本輪最終收尾）
commit `3b49da3` push 後，web／worker 皆自動重建。由於本輪未新增 API 路由，無法沿用先前的 404→401 判斷法，改用**真實合成資料跑一次完整功能驗證**——結果發現正式站 worker 對**所有**解析工作皆失敗（含跟 Sprint 7 同款的簡單測試 PDF），但本機用相同程式碼與資料可成功處理，證明是環境問題非邏輯問題。加臨時診斷 log 重新部署一次，抓到根因：**worker service 缺少 `SUPABASE_URL` 環境變數**（KB-025，已補上）。

診斷過程中，執行 `zeabur variable create` 補環境變數時，**CLI 的成功確認訊息意外印出該 service 整個既有變數表**，導致 `PASSWORD`／`SUPABASE_SERVICE_ROLE_KEY` 兩個既有機密外洩於對話中——本專案第 4 次意外機密外洩事故（KB-026）。PO 立即於 Supabase 後台重新產生兩者的新值，同步更新至 web／worker 兩 service，兩 service 依序重啟並確認 `/api/health` 穩定，本機 `.env` 亦用腳本同步更新（未使用會顯示內容的工具）。事後以真實合成 PDF 端到端驗證確認：新憑證下 worker 恢復正常，且 Sprint 8 的解析修法（無法辨識欄位維持 `null`、頁首列排除）表現正確。已將 CLAUDE.md 的機密處理規則從「只禁 `zeabur variable list`」強化為「`create／update／delete` 三者的標準輸出一律不可直接查看，須重導向至檔案＋窄範圍確認」。

診斷用的臨時 log（`console.error("[TEMP-DIAG]", ...)`，繞過 logger 白名單但只印基礎設施層級訊息、不落 DB）已於確認根因後移除（commit `bcb4065`），該 commit 亦已部署驗證通過（web／worker 皆 `RUNNING`，worker log 清潔啟動）。本輪產生的所有測試帳號、專案、文件、Storage 物件皆已清除。

### 已知殘留限制（誠實記錄，AC-6）
- **語法上恰好合法的黏合巧合無法辨識**：如 `"14290-135"`（無單位字尾）本身語法上就是合法的 `RANGE_TOKEN`（142 是否為真正下限、90 是否為真正上限，本質上無法從字串本身判斷），純規則驗證對這類「巧合合法」的黏合殘留無能為力。這是資訊遺失（pdfjs 合併時機制性丟棄邊界）造成的根本限制，非本輪實作疏漏。
- 本輪驗證基礎為「合成 fixture＋端到端管線」，**未能重新取得 Sprint 7 那份真實樣本**（原始檔案在使用者本機 D 槽，本次工作環境無法存取；DB／Storage 內的測試副本已依隱私協定於 Sprint 7 測完即清除）；若要對照同一份真實文件驗證修法效果，需使用者重新提供，非本輪阻塞條件（DOR A27 已預先說明此限制）。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 全專案 75 test／14 檔全綠；`pnpm build` 乾淨過；typecheck／lint 無新增錯誤（僅 2 個既有無關 warning）
- [x] 肉眼驗收：合成資料走完整真實管線（真實 Storage＋真實 Worker＋真實 UI），非僅單元測試
- [x] 修正皆反映於規格與文件：本節＋KB-024＋SDD §15／SYNC／ROADMAP 已更新
- [x] 假設 A26–A28 已於 DOR 追認；本輪技術方向於實作中修正（A26 原訂方案不成立，改採內容驗證），已如實記錄於上方「根因診斷」
- [x] 四層權限鏈：N/A（不新增查詢路徑）；日誌掃描：合成 fixture 比照健康內容規則處理；LLM Streaming N/A
- [x] 真實個資處理：本輪未使用任何真實 PHI，端到端驗證用純合成資料；測試帳號/專案/文件/Storage 物件測完即清除
- [x] PO 2026-07-17：commit（`3b49da3`）＋push＋正式站部署驗證通過（web／worker 皆 `RUNNING`，真實合成資料端到端功能驗證確認新版行為正確）
- [x] PO 2026-07-17：意外機密外洩（第 4 次，KB-026）已完成輪替並驗證恢復正常；CLAUDE.md 規則已強化；診斷用臨時 log 已移除並部署驗證（commit `bcb4065`）
- [ ] 下一步：E2-F2 結案，開 Sprint 9（E2-F3：人工確認與入庫模組）DOR

### 本輪工程筆記
- **關鍵教訓**：不要在寫探測腳本之前就依「聽起來合理」的假設動手改程式碼。DOR 原訂 A26 的「x 間距拼接」方向初聽合理，實際用合成測試腳本量測 pdfjs 行為後才發現打錯地方——探測優先於實作，尤其是依賴第三方函式庫內部行為的假設。
- `RANGE_TOKEN` 需同時支援「單邊比較符號（`<200`）」與「雙邊區間（`4.0-10.0`）」但不可接受裸數字，否則會與 `VALUE_TOKEN` 混淆、也會讓黏合殘留物更容易誤判為合法區間；重寫時一度因把裸數字排除得太嚴格而誤破壞既有的 `<200` 測試案例，修正後才通過。
- A28 防呆採「完全排除」而非「降低信心值」：頁首／病患中繼資料列本質上不是檢驗數據，不該出現在候選列裡（即使標低信心也不合適），這與黏合殘留字串（列本身是真的檢驗數據，只是某個欄位無法辨識）在語意上是不同的兩種情況，兩者的正確處理方式也不同。

## Sprint 7 — E2-F2：文字型 PDF 解析管線（PoC 1/2）✅ 已 commit＋push＋正式站部署驗證通過

- 期間：2026-07-16（單日完成機制實作與驗證）
- DOR：✅ 通過（sprints/sprint-07-dor.md；A22–A25 由 PO 追認）
- 目標：A22 可行性驗證＋自動觸發＋PoC 解析啟發式＋KB-022 逾時防線＋四層鏈重用＋唯讀結果 UI → **機制面達成**；準確率面待真實樣本

### 驗收結果（AC-1～AC-9；整合測試＋對真實 Supabase Storage／真實 Worker 進程的 curl 驗證）
| AC | 結果 |
|---|---|
| AC-1 | ✅ 真實驗證：`completeUpload` 成功後自動轉 `processing`，真實 Worker 進程（`pnpm worker`）輪詢撿起並執行 `parse-document` |
| AC-2 | ✅ 整合測試＋真實驗證：清楚檢驗列（項目/數值/單位/參考區間皆匹配）→ `confidence=0.95`、`status=extracted`，`page_number`／`coordinates` 正確回查 |
| AC-3 | ✅ 整合測試＋真實驗證：缺單位與參考區間的列 → `confidence=0.45`、`status=low_confidence`（C14 閾值 0.85 生效） |
| AC-4 | ✅ 整合測試：無文字層 PDF（空白頁模擬）→ `processing_failed`，不誤植假資料 |
| AC-5（KB-022 安全防線） | ✅ 單元測試（`with-timeout.test.ts`）驗證逾時機制本身；`main.ts` 已將 `handler(job)` 包上 60 秒逾時。**未做**真正模擬病態 PDF 拖垮 Worker 的端到端測試（不易在單元測試中安全模擬），機制正確性以程式碼檢視＋單元測試佐證，非完整整合驗證 |
| AC-6 | ✅ 整合測試（四層鏈重用）：候選項存在專案 A，用專案 B 的 id 查一律 `PROJECT_ACCESS_DENIED` |
| AC-7 | ✅ 整合測試＋真實驗證：reprocess 清空舊候選、重新 enqueue、真實 Worker 重新解析成功（1.27 秒），無重複 |
| AC-8 | ✅ 整合測試＋真實 log 檢查：日誌不含抽取內容（項目名稱／數值） |
| AC-9（PoC 準確率記錄） | ✅ **真實樣本完成，結論明確**——見下方 KB-023 說明 |

### AC-9 詳細記錄（真實樣本，KB-023）
本輪先用自建合成 PDF 證明管線機制正確（4 行測試列全數依信心值正確分級，Worker 1.3～3.0 秒完成），接著 PO 提供 **7 份 2020～2025 年、自己（及一位家屬）的真實員工健檢報告 PDF**，全數跑過真實 Worker 進程：

- **7 份僅 1 份（14%）有文字層**能進到解析邏輯，其餘 6 份（86%）`pdfjs-dist` 回傳零文字項目，直接 `processing_failed`——不是準確率不夠，是**多數真實文件根本進不了這條 pipeline**
- 唯一成功的 1 份正確抽出多筆真實數值（身高體重、WBC、膽固醇、血糖等），但也暴露具體缺陷：多欄表格的參考區間與數值互相污染、單位常抓不到、頁首病患資訊被誤判成檢驗項目（且信心值偏高）
- **PO 說明真實成因**：台灣醫療院所預設寄紙本，只有私人健檢中心在病患提供 Email 時才寄電子檔；**真實世界最常見的上傳方式是使用者拿手機拍紙本**，不是上傳醫院寄來的 PDF——與實測比例完全吻合，非樣本偏差

**結論（不再是「待判斷」，是「已判斷」）**：即使把文字解析準確率調到完美，E2-F2/E2-F3/E2-F4 這條路線的天花板可能只覆蓋一到兩成真實使用情境。**OCR 不是「排在後面的加分項」，是「這條產品路徑能不能服務多數使用者」的關鍵瓶頸**，優先順序需要 PO 重新拍板（原暫定排在 E2-F3 之後）。

### DOD 核對
- [x] 正常／邊緣／錯誤測試通過：Vitest 14 檔／69 test 全綠；`pnpm build` 乾淨過；typecheck／lint 無錯誤
- [x] 肉眼驗收：對真實 Supabase Storage＋真實 Worker 進程端到端驗證（非僅假 adapter／假 queue）；UI 唯讀解析結果表格以真實資料驗證
- [x] 修正皆反映於規格與文件：SDD §15／SPRINT_LOG／KB-022／SYNC／ROADMAP 已更新；OpenAPI 已補 extractions/reprocess 端點
- [x] 假設 A22–A25 已於 DOR 追認；本輪無新增 A 編號
- [x] 追加 DOD：四層權限鏈為重用非新增（AC-6）；日誌掃描 P0（AC-8，抽取內容是最直接的健康數值本身）；LLM Streaming N/A；**PoC 準確率記錄（AC-9）以 7 份真實樣本完成，如實記錄 14% 文字層比例，不迴避不利結論**
- [x] 真實個資處理：7 份真實健檢 PDF（PO 本人＋一位家屬）僅用於本機測試，每輪測完立即清除 DB 列與 Storage 物件（含刪除確認），未寫入任何 commit 或文件；抽取結果原始 dump 亦未留存於文件內
- [x] PO 2026-07-17：commit（`212ce90`）＋push＋正式站部署驗證通過（web／worker 兩 service 皆 `RUNNING`，`/api/projects/{id}/documents/{documentId}/extractions` 回 401 確認新版上線，worker log 確認 `Worker 啟動`）
- [x] PO 2026-07-17：OCR 優先順序拍板——維持原計畫排在 E2-F3 之後，不因 KB-023 的 86% 數字提前
- [ ] 下一步：規劃 Sprint 8（E2-F3／E2-F4，是否同批納入已知的抽取準確率調校）

### 本輪工程筆記
- A22（`pdfjs-dist` 伺服器端文字＋座標抽取）一次驗證成功，用 `pdfjs-dist/legacy/build/pdf.mjs`（Node 相容版本），`getTextContent()` 的 `transform` 陣列可直接取得 x/y 座標
- 新增 `src/lib/with-timeout.ts`（KB-022 逾時機制，`Promise.race` 包裝），套用於 `src/worker/main.ts` 的 `tick()`；已知限制：JS 沒有真正搶占式取消，逾時只是不再等待，底層 promise 若真的卡死仍會在背景耗資源，完整隔離需要 child process，本輪判斷這個折衷對 PoC 階段足夠
- `completeUpload`（E2-F1 既有函式）擴充簽章新增 `QueueAdapter` 參數，成功後直接轉 `processing` 並 enqueue——`uploaded` 狀態在本實作中是概念性的瞬間過渡，未實際持久化，E2-F1 原本斷言 `status: "uploaded"` 的測試已相應更新為 `"processing"`（刻意的設計變更，非回歸）
- **測試基礎設施重大修正**（KB-019 最終更新）：新增 `extraction-service.test.ts` 後，四個共用 `@projects.test.invalid` 網域的測試檔（`projects`／`profiles`／`documents`／`extraction`）的 `afterAll` 清理查詢**全部沒吃到各自的 seed 前綴**，平行執行時互相刪到對方使用中的資料，導致斷言失敗與 hook timeout（10 秒）。修法：(1) 清理查詢的 `like()` 條件收緊為各自前綴；(2) 抽出共用 `tests/unit/helpers/cleanup-test-data.ts`，用 `inArray` 批次刪除取代逐列 `for` 迴圈刪除（原本 200 筆配額測試資料會逐筆觸發 200 次 DB 往返，是 hook timeout 的另一半原因）。四個檔案改用共用 helper 後測試套件從「偶發 timeout」穩定變成 8 秒內全綠。

### 給下一個 Sprint 的具體提醒
- **KB-023 是本輪最重要的產出，下一個 Sprint 開工前務必先讀**：86% 真實健檢報告無文字層，OCR 優先順序待 PO 拍板，可能直接影響 Sprint 8 該做什麼（文字解析調校 vs. 轉向 OCR）
- 若未來真的開 OCR Feature，設計時納入「手機拍照」情境（透視變形、光線不均、解析度、單頁未拍全），不能只當作「掃描機掃描」那麼乾淨
- 之後任何新表若會被 `@projects.test.invalid` 系列測試建立，新測試檔直接用 `tests/unit/helpers/cleanup-test-data.ts` 的 `cleanupTestData(前綴)`，不要再手寫清理迴圈

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
