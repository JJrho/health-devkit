# SDD 系統規格文件 — 個人健康檢查管理平台（MVP）

> 狀態：**定稿 v1.0.0（RATIFIED 2026-07-11）**；Clarify C1–C22 已全數決議（採建議預設值），決議紀錄見 archive/previous_decisions/clarify-decisions-2026-07-11.md
> 上游來源：`archive/upstream_spec/個人健康檢查管理平台_規格_v1_0_0.md`（完整規格以該文件為準，2026-07-17 補進 repo，詳見 KB-027）；本 SDD 為 MVP 的「當前有效規格」精煉版
> 位階：受 `02_CONSTITUTION.md` 約束。遵循方法論：AI 敏捷開發流程 v1.2.0

## 1. 系統目標

讓 50–65 歲使用者將多年健檢資料整理成可追溯的健康紀錄，建立可驗證、可停止、可調整的健康行動計畫，持續追蹤執行與不舒服事件，並在資料不足、無改善或出現安全疑慮時，協助整理資料供專業人員評估。本產品不診斷、不開藥、不停藥、不以命理預測健康。

## 2. 使用者角色

| 角色 | 進入方式 | 能做什麼 |
|---|---|---|
| 使用者（本人） | Email 或 Google 登入 | 專案 CRUD、上傳、確認辨識、看趨勢、AI 問答、行動計畫、回報、匯出、刪除帳號 |
| 系統管理者（PO 本人） | seed script／DB 直接維護（C3） | 知識來源建立與審核；MVP 不做管理 UI |
| 成年子女代理 | — | **不在 MVP**（Phase 2） |
| 專業人員 | — | **不在 MVP**（Phase 2+） |

## 3. 核心使用流程

- 首次使用（上游 §7.1，14 步）：註冊 → 建專案 → 上傳（先預覽）→ 辨識 → 人工核對確認 → 戰情 → 建立行動計畫 → 設定回報與檢討。
- 後續追蹤（上游 §7.2）：定期回報 → 領先指標追蹤 → 症狀記錄 → 到期檢討 → 結果分類 → 維持／調整／暫停／停止／轉介。
- 正確資料鏈（上游 §35）：原始報告 → 預覽 → 自動讀取 → 人工確認 → 正式紀錄 → 趨勢 → 證據與不確定性 → 可停止的行動計畫 → 回報 → 檢討 → 分流 → 有來源的 Streaming 摘要。

## 4. 功能模組（12 個）

> 每模組完整欄位定義見上游規格對應章節；此處記載模組邊界、設計意圖與代表性驗收情境。詳細 BDD 案例見 08_TDD_ACCEPTANCE_TESTS.md。

### 4.1 帳號與工作階段（auth）
- 功能：Email/Google 註冊登入、驗證、忘記密碼、session、個資管理、刪除申請。（上游 §5.1、§22.1、§28.1）
- 設計意圖：高齡族群的信任起點；Google 憑證必須伺服器驗證，杜絕半完成帳號。
- 驗收（例）：Given 已存在某已驗證 Email 帳號，When 以同 Email 再註冊，Then 系統提示既有帳號而不得無提示建立第二帳號。

### 4.2 健康專案（projects）
- 功能：建立、修改、封存、還原、刪除；重登回到最近專案。（§22.2、§28.2）
- 設計意圖：專案是持久化與權限的邊界——所有健康資料都掛在專案下，跨帳號零存取是本產品的生存底線。
- 驗收（例）：Given 帳號 B 持有效 session，When 以帳號 A 的 project_id 請求資料，Then 回應 PROJECT_ACCESS_DENIED 且稽核記錄。

### 4.3 個人健康背景（profiles）
- 功能：慢性病、用藥、過敏、活動史、醫師限制等背景；自動儲存、續編。（§11.1、§12.2）
- 設計意圖：安全規則引擎的燃料——背景不足時計畫不得啟用（PLAN_SAFETY_INFO_REQUIRED）。

### 4.4 文件上傳與預覽（documents）
- 功能：upload session、分段上傳、上傳前預覽、縮放保比例、取消、重試、去重、軟刪除。（§20、§22.3、§28.3）
- 設計意圖：50+ 使用者最怕「傳了但不知道傳了什麼」；先預覽後上傳是信任機制，不是花俏功能。
- 驗收（例）：Given 同一檔案已上傳完成，When 使用者重複提交同 idempotency key，Then 不建立重複文件。

### 4.5 辨識與人工確認（extraction）
- 功能：解析工作、信心值、頁面座標回查、人工 CRUD、確認入庫。（§28.4、狀態機 §18.1）
- 設計意圖：**「未確認資料不進正式分析」是本產品第一鐵則**——AI 讀錯一個血糖值而使用者照做，是本產品最大的傷害路徑。
- 驗收（例）：Given 報告完成辨識但未確認，When 開啟趨勢頁，Then 該報告資料不得出現且顯示待確認提醒。
- 安全備註（KB-022，2026-07-16）：本模組（E2-F2）在 Worker 端解析未經完整掃毒的使用者上傳內容，屬本產品目前最貼近「處理不受信任輸入」的一段程式碼。防線不是等 E6-F2 補惡意檔案掃描才生效——本模組本身即需對解析工作加逐工作逾時／資源上限，防止惡意構造的檔案結構拖垮或卡死 Worker；惡意檔案掃描（KB-021）維持原計畫留在 E6-F2，兩者防的是不同威脅模型，互補而非互斥。

### 4.6 正式檢驗紀錄與標準化（observations）
- 功能：項目別名、單位白名單與換算、版本鏈、來源追溯。（§17、§28.5）
- 設計意圖：不同院所同項目不同名稱與單位——不能合併就寧可不畫線，錯誤連線比沒有連線更危險。原值永遠保留。
- 驗收（例）：Given 兩筆同項目但單位不可換算，When 檢視趨勢，Then 顯示 UNIT_NOT_COMPARABLE 且不得錯誤連線。

### 4.7 健康戰情與趨勢（dashboard）
- 功能：Dashboard 六區塊（§26）、趨勢圖、篩選、等價資料表、來源 drill-down。（§28.5）
- 設計意圖：只用已確認資料、每點可回查——「可追溯」是使用者敢給醫師看的前提。

### 4.8 知識來源與證據衝突（knowledge）
- 功能：來源 CRUD 與審核、版本、切分索引、主張、衝突狀態七分類。（§13、§28.6 部分）
- 設計意圖：AI 的可信度不來自語氣，來自「每句醫學敘述都能點開來源」；衝突不隱藏，照實呈現七種狀態。

### 4.9 AI 串流問答（conversations）
- 功能：對話、訊息、引用、檢索、安全檢查、Streaming、取消、重新產生。（§21、§22.5、狀態機 §18.2）
- 設計意圖：Streaming 是尊重（不讓人盯白屏），引用驗證是誠實（claim 與段落一致才能出）。八段回答結構見上游 §21.2。
- 驗收（例）：Given 資料不足以回答，When 使用者提問，Then 回 AI_INSUFFICIENT_DATA 語意內容而非編造結論。

### 4.10 健康行動計畫與回報（plans）
- 功能：plan/action/metric/check-in/symptom CRUD、啟用前安全審查、暫停恢復停止、版本。（§8、§12、§22.6、狀態機 §18.3）
- 設計意圖：計畫必附「基準、指標三分類（領先/結果/安全）、檢討日、停止條件」——可停止的計畫才是安全的計畫。

### 4.11 檢討與轉介摘要（reports/reviews）
- 功能：定期檢討、無改善十分類（§9.3）、症狀事件、專業轉介摘要、看診摘要、匯出。（§28.7）
- 設計意圖：「沒有改善不代表失敗」寫進系統行為：不加強度、不責怪、給出維持/簡化/替代/停止/專業評估五選項。

### 4.12 稽核與資料權利（audit）
- 功能：audit_events、資料匯出、帳號與資料刪除鏈。（§27.3）
- 設計意圖：管理者預設無權看健康內容；刪除是真刪除（含 Storage 與依賴），不是藏起來。

## 5. 畫面結構

公開站（Hero／說明／隱私／註冊登入）＋個人工作區十頁（上游 §6.2）。戰情頁六區塊版面採上游 §26 SVG；色彩規範採 §25（主色 #2563EB，狀態不得只靠顏色）。高齡優化：大字、高對比、少步驟、防重複提交、可列印（§3.3）。

## 6. 資料欄位

25 張主表清單見上游 §23（users…audit_events）。關鍵型別規則入憲法 §4（numeric、timestamptz、jsonb 座標、soft delete、integer version）。物件與狀態總表見上游 §17。

## 7. 權限規則

四層驗證鏈（登入 → 專案擁有權 → 資源屬於專案 → 未刪除）＋分享授權有效性；RLS 為第二道防禦。禁止只信前端 project_id。（上游 §23 末、技術選型 §7.3）

## 8. 通知與提醒

MVP 僅站內提醒：檢討到期、待確認資料、計畫暫停原因。Email 通知僅帳號類（驗證、重設、刪除確認）。行銷通知不做。

## 9. 報表與查詢

趨勢查詢 P95 ≤ 2 秒；看診摘要（格式待 C19）；匯出（格式待 C20）。

## 10. 錯誤處理

錯誤碼 20 個採上游 §24，統一 error envelope、request_id、idempotency、VERSION_CONFLICT 不靜默覆寫。文案維持溫和不指責語氣。

## 11. 非功能需求（量化）

採上游 §27 全文：效能（AI 首段 P95 ≤ 3 秒等）、可用性（月 ≥ 99.5%、AI 掛掉時既有資料仍可看）、安全隱私（§27.3 全列）、無障礙（WCAG 2.2 AA）、可維護性（Adapter 可替換、migration 可回滾）。

## 12. 技術限制

見 `04_TECHNICAL_SPEC.md`（＝技術選型 v1_0_0 決策紀錄 §23）。核心約束入憲法 §1。

## 13. MVP 範圍

採上游 §34 凍結範圍十二條；不交付清單同 §34。明確不做清單採 §5.3。

## 14. 未來版本規劃

子女代理、多成員、專業協作（中醫 T2/T3）、穿戴、醫院同步、App、多語系（上游 §5.2、§14）。紫微斗數永久獨立品牌與資料庫（§15）。

## 15. 當前 Sprint 狀態

**E1-F2 帳號生命週期完成（2026-07-15，Sprint 3，Feature 2/20）**：Email 註冊/驗證/登入/忘記密碼/session/鎖定全數上線並經 PO 正式站親自驗收（含完整密碼重設流程）。密碼重設改走 Supabase implicit recovery flow（KB-012，免費方案 Email 樣板無法自訂）；Zeabur 伺服器已升級 2C/4GB（KB-013）。細節見 07_SPRINT_LOG、KB-009~014。

**E1-F4 健康專案模組與四層權限鏈完成（2026-07-15，Sprint 4，Feature 3/20）**：`projects` 表＋CRUD＋封存/還原/軟刪除＋OCC 樂觀鎖（首次落地 VERSION_CONFLICT）＋四層權限鏈（`src/modules/projects`）皆已完成，用真實瀏覽器＋跨帳號 session 手動驗證通過（403/401 語意區分、稽核 log）；typecheck／lint／`pnpm build`／34 個單元＋整合測試全綠；已 commit（`1d4da9e`）＋push＋正式站部署驗證通過。⚠️ RLS 政策已建立但因連線角色 BYPASSRLS 尚未實際生效（KB-018）；另發現 E1-F2 遺留問題——全新未驗證帳號目前無法登入，與 C6 牴觸（KB-020）。PO 2026-07-15 決定兩者皆暫緩、記錄為已知限制。細節見 07_SPRINT_LOG。

**E1-F5 個人健康背景模組完成（2026-07-15，Sprint 5，Feature 4/20，E1 全數結案）**：`health_profiles` 表（jsonb 承接上游 §11.1／§12.2 共 20 欄位）＋`GET`/`PUT` autosave＋OCC 樂觀鎖＋四層鏈第 3 層「資源屬於專案」首次真正落地並驗證（同一使用者的兩個專案，背景資料互相隔離）。真實瀏覽器驗證：autosave 生效、續編（重新整理後資料保留）、跨帳號 403＋稽核 log 不含健康內容。typecheck／lint／`pnpm build`／41 個單元＋整合測試全綠。過程修正一則測試基礎設施回歸（KB-019 更新：`projects-service.test.ts` 清理邏輯需先清新表 `health_profiles` 才能刪 `projects`）。已 commit（`02dd80a`）＋push＋正式站部署驗證通過。E1 平台與信任基座至此全數完成（F1/F2/F4/F5；F3 Google 登入依規劃後移）。

**E2-F1 上傳會話與預覽模組完成（2026-07-16，Sprint 6，Feature 5/20）**：StorageAdapter 首次實作（`SupabaseStorageAdapter`，A18）＋`documents` 表（局部唯一索引支援取消重傳）＋上傳會話 API（建立/分段/complete/取消/列表/preview）＋C12/C13 業務規則（magic bytes 內容驗證、20MB／30 頁上限、200 份配額）＋四層鏈第 3 層首次於**有獨立 id 的巢狀資源**上真正生效。真實驗證：對真正的 Supabase Storage 跑完整流程（建立→上傳 PDF→complete→列表→取得 signed URL→下載確認內容正確→跨帳號 403＋稽核 log→刪除確認 Storage 物件真的被移除），C6 email 驗證閘也已用未驗證帳號實測擋下。54 個測試＋typecheck／lint／`pnpm build` 全綠。⚠️ A21（惡意檔案掃描缺口）正式生效，登記 KB-021。已 commit（`b2b413f`）＋push＋正式站部署驗證通過。

**E2-F2 文字型 PDF 解析管線 PoC 1/2 實作完成（2026-07-16，Sprint 7，Feature 6/20）**：A22（`pdfjs-dist` 伺服器端文字＋座標抽取）驗證可行——這是本輪最大技術不確定性，已排除。`extracted_items` 表＋自動觸發（`completeUpload` 成功後即 enqueue 解析工作）＋PoC 啟發式解析（A23：欄位順序＋正則式判斷信心值，C14 閾值 0.85）＋KB-022 安全防線（Worker 逐工作逾時 60 秒，取代提前補惡意檔案掃描）＋四層鏈重用於 `extracted_items`＋唯讀解析結果 UI。對真實 Supabase Storage＋真實 Worker 進程端到端驗證：自建 4 行檢驗數據合成 PDF（英文，因 pdf-lib 標準字型無法內嵌 CJK）全數正確抽取，3 筆四段皆清楚匹配（confidence 0.95，extracted），1 筆刻意缺單位/參考區間正確判定低信心（0.45，low_confidence，C14 生效）；reprocess 驗證清空重建無重複；Worker 兩次解析耗時 1.3～3.0 秒，遠低於 60 秒逾時上限。69 個測試＋typecheck／lint／`pnpm build` 全綠。過程發現並修正測試基礎設施更根本的問題（KB-019 最終更新：四個共用網域的測試檔清理查詢未吃到各自前綴，平行執行互刪導致 hook timeout；改寫為共用 `cleanupTestData` 批次刪除 helper，同時修正效能與正確性）。

**AC-9（PoC 準確率）已用 7 份 PO 真實健檢報告完成，結論明確（KB-023）**：2020～2025 年、PO 本人＋一位家屬的真實員工健檢 PDF，7 份僅 1 份（14%）有文字層能進到解析邏輯，其餘 6 份（86%）在「準確率」被評估前就先卡在「無文字層」——`pdfjs-dist` 對這些檔案回傳零文字項目。唯一成功的 1 份正確抽出多筆真實數值，但也暴露具體缺陷（多欄表格參考區間與數值互相污染、單位常抓不到、頁首病患資訊誤判為檢驗項目）。**PO 說明真實成因**：台灣醫療院所預設寄紙本，僅私人健檢中心於病患提供 Email 時才寄電子檔，真實世界最常見的上傳方式是**手機拍紙本**，與實測比例吻合。**結論：即使文字解析準確率調到完美，E2-F2/F3/F4 路線天花板可能只覆蓋一到兩成真實使用情境，OCR 是覆蓋率的關鍵瓶頸**。**PO 2026-07-17 拍板：OCR 排程維持原計畫、排在 E2-F3 之後，不因此提前**（見 05_BACKLOG／13_ROADMAP）。真實個資測完即從 DB／Storage 清除，未留存於任何文件或 commit。Sprint 7 已 commit（`212ce90`）＋push＋正式站部署驗證通過。

**E2-F2 文字型 PDF 解析管線 PoC 2/2（準確率調校）完成，E2-F2 正式結案（2026-07-17，Sprint 8，KB-024）**：針對 Sprint 7 三個已知缺陷做根因修正。**過程推翻 DOR 原訂技術方向**：合成探測腳本（不含真實資料）量出 pdfjs 對間距 <1.5pt 的相鄰文字會合併成單一字串且零分隔字元，欄位邊界資訊在到達應用層前已遺失，「依 x 間距重新拼接 item」（原 A26 方向）打不中問題。改採**內容形狀驗證**：`rawUnit`／`rawReferenceRange` 只在通過驗證時才指派，否則維持 `null`（UI 顯示「無法辨識」），對應 PO 拍板的 first priority——寧可誠實地不完整，不猜測切法。另加 A28 防呆：含冒號的頁首／病患中繼資料列直接排除，不進候選列。合成多欄 fixture＋端到端真實管線（真實 Storage／Worker／UI，僅合成資料非真實 PHI）皆驗證通過。全專案 75 個測試／typecheck／lint／`pnpm build` 全綠。已知殘留限制：語法上恰好合法的黏合巧合（如無單位字尾的裸數字範圍）仍無法辨識，這是資訊遺失造成的根本限制，非實作疏漏，詳見 KB-024。已 commit（`3b49da3`）＋push＋正式站部署驗證通過（部署驗證過程另發現並修復 worker 環境變數缺口，KB-025；亦記錄本專案第 4 次意外機密外洩事故並完成輪替與規則強化，KB-026）。

**E2-F3 人工確認與入庫模組完成（2026-07-17，Sprint 9，Feature 7/20）**：讓使用者對 `extracted_items` 候選列新增、編輯、接受、拒絕，並透過確認 transaction 把文件鎖定為 `confirmed`（上游 §18.1）。開工前撰寫 DOR 時發現本專案「上游規格」章節引用長期查無實據——原始完整規格檔案從未 commit 過，已由 PO 提供並補進 `archive/upstream_spec/`（詳見 KB-027），DOR 因此得以依驗證過的原文重寫。新增 `extracted_item_edits` 異動歷史表（A36，落實憲法 §4「原值永久保留」）；E2-F3／E2-F4 邊界依上游 §17 逐字確認（E2-F3 只管候選列生命週期，別名／單位／numeric 標準化留給 E2-F4）。實作中修正 DOR 未言明的一致性缺口：confirmed 後的候選列需鎖定，PATCH／DELETE 一律擋下。合成資料端到端真實管線＋瀏覽器互動驗證（編輯→接受→確認→UI 即時鎖定為唯讀）皆通過。全專案 84 個測試（+9）／typecheck／lint／`pnpm build` 全綠。已 commit（`b9f878d`）＋push＋正式站部署驗證通過；PO 就 KB-021（惡意檔案掃描）拍板維持原計畫留到 E6-F2。

**E2-F4 標準化與正式紀錄模組完成，E2-F4 正式結案、E2 Epic 全數完成（2026-07-18，Sprint 10，Feature 8/20）**：把 E2-F3 確認完成的候選列，透過別名精確比對＋單位白名單自動標準化為正式數值紀錄（`observations`），由 Worker 於 `confirmDocument` 成功後非同步觸發（`standardize-document` job）。新增 4 張表：`test_definitions`／`test_aliases`（僅精確字串比對，A40，避免模糊比對誤連不同檢驗項目）／`test_definition_units`（單位白名單＋`factorToCanonical`）／`observations`（`numeric` 型別，版本鏈採「新增列＋舊列 superseded」模式，A42，區別於 E2-F3 純附加異動歷史表模式）。種子資料刻意保守（A41）：僅 4 個已知項目各 1 筆精確別名＋恆等換算，不發明真實醫療單位換算係數。`observations` 掛在專案層級（A43，依上游 API 路徑確認），支援版本鏈橫跨多份文件。全專案 95 個測試（+11）／typecheck／lint／`pnpm build` 全綠；合成資料端到端真實管線＋瀏覽器驗證（標準化結果正確渲染於「已入庫的正式紀錄」區塊＋候選列沿用鎖定唯讀行為）皆通過。PO 指示「開啟該 DOR 時即部署」，本輪 DOR 通過後直接做到部署，未逐步停下確認。已 commit（`cde2e5e`）＋push＋正式站部署驗證通過（web／worker 皆 `RUNNING`，新路由 404→401 確認上線，對正式站真實合成資料端到端功能驗證：上傳→真實 Worker 解析→接受→確認→真實 Worker 標準化→`observations` API 正確回傳皆成功）。

**E3-F2 趨勢圖與等價資料表完成（2026-07-18，Sprint 11，Feature 9/20）**：把 E2-F4 已標準化的正式紀錄依測項分組，畫成時間序列趨勢圖＋等價可存取資料表，每點可回查來源（上游 §6.2「趨勢分析」，十個工作區頁面之一，新增 `/projects/[id]/trends`）。開工前撰寫 DOR 時逐條核對上游 §17／§28.5，發現兩個先前輪次因範圍收斂而合理省略、本輪下游功能需要才補上的資料缺口：`documents` 補上 `reportDate`（A45，趨勢圖時間軸；為 null 時 fallback 為上傳時間並標記 `dateEstimated`）、`observations` 補上 `rawReferenceRange`（A46，標準化時從 `extracted_items` 原樣複製，落實憲法 §4「原值永遠保留」延伸至參考區間）。新增 `PATCH /documents/{id}`（僅開放編輯 `reportDate`，不比照 E2-F3 confirmed 鎖定規則，A47——純描述性中繼資料，任何未刪除文件狀態皆可編輯）與 `GET /projects/{id}/trends`（依測項分組，額外依 `unit` 再分組作縱深防禦，若同一測項出現異常混線的單位就拆成獨立子序列並標記 `unitMismatch`，絕不靜默合併，A48）。UI 用 ECharts 折線圖＋純 HTML 等價資料表並列（WCAG 2.2 AA，上游 §27.4）。全專案 105 個測試（+10）／typecheck／lint／`pnpm build` 全綠；合成資料端到端真實管線＋瀏覽器互動驗證（三份不同日期文件正確依日期排序、fallback 日期正確標記估計、補上日期後即時反映、drill-down 正確觸發）皆通過。已 commit（`01ba99b`）＋push＋正式站部署驗證通過。部署驗證過程發現並記錄新知識點：worker 部署交接期存在數分鐘的競態窗口，`RUNNING` 顯示的那一刻舊版程式碼容器可能仍短暫存活並搶到佇列工作（KB-028）——重跑驗證後確認為交接期暫時現象、非程式錯誤。已知限制：E3-F1（健康戰情 Dashboard）本輪未觸及，已於 Sprint 12 完成（見下段，排序疑慮已釐清：E3-F1 其實緊接在本輪之後即可實作，非延後至 E4／E5，詳見 A51）；參考區間本輪僅資料表呈現，圖表未疊視覺帶。

**E3-F1 健康戰情 Dashboard（六區塊版面）完成，E3 Epic 全數完成（2026-07-19，Sprint 12，Feature 10/20）**：新增專案預設首頁 `/projects/[id]`，依上游 §26 六區塊版面呈現健康戰情總覽。開工前發現一個排序上的潛在誤解——上游 §26 完整線框圖描繪的是行動計畫已存在之後的畫面，一度讓人以為該延後至 E4／E5 之後；查證後確認 05_BACKLOG 對 E3-F1 前置依賴僅列 E2-F4，且上游 §7.1 使用者旅程明確把「查看健康戰情」排在「建立行動計畫」之前，證明首次查看無行動計畫是設計上的正常狀態（A51）。本輪依既定順序實作，六區塊全建置：「目前健康狀態」「早期變化」用 E2-F4／E3-F2 真實資料呈現（A50：不做電腦化超標判讀，僅原樣顯示數值與參考區間，真正的臨床解讀留給未來 E4-F3 AI 問答），其餘四區塊（行動計畫／情境與應對／證據與不確定性／專業協助）依賴尚未建置的 E4／E5，顯示誠實的「尚未推出」占位。附帶修正全站既有 `<a href="/projects">` 應改用 Next.js `<Link>` 的技術債（新頁面觸發 ESLint 規則正確識別，非本輪引入）。全專案 111 個測試（+6）／typecheck／lint／`pnpm build` 全綠；合成資料端到端真實管線＋瀏覽器互動驗證＋正式站真實功能驗證皆通過。已 commit（`e02871f`）＋push＋正式站部署驗證通過（web／worker 皆 `RUNNING`，新路由 404→401 確認上線；依 KB-028 教訓，`RUNNING` 後刻意等待約 3 分鐘緩衝期才進行功能驗證，未再遇到交接期競態）。已知限制：僅 2/6 區塊有真實資料，E3「完成」指依既定順序交付本輪範圍，非六區塊功能全數到位。

**E4-F1 知識來源與檢索基座完成（2026-07-19，Sprint 13，Feature 11/20）**：建立 `knowledge_sources`／`knowledge_chunks` 資料模型與純服務層檢索函式 `searchKnowledge()`／切分工具 `chunkText()`，供 E4-F2／E4-F3 未來直接使用；本輪無 API 路由或 UI（無消費者）。開工前確認「首批知識來源整備」外部依賴時，PO 提供合作醫師王健宇醫師已出版衛教書籍《為什麼你的病總是看不好？》（38 章節、706 頁）作為真實內容；同時提供的同批 OCR markdown 版本經查核後發現系統性辨識錯誤，已否決不用，改由 AI 逐頁視覺閱讀＋人工轉錄完成 2 個試點章節（11 頁）驗證 seed 管線，其餘留待後續迭代。真實內容 `status` 設為 `draft`（A55），確保未經最終校對的內容不會被檢索提早引用。實作檢索機制時發現原規劃的 Postgres 內建全文檢索（tsvector）對中文完全不斷詞，改用 `pg_trgm` trigram 索引＋`ILIKE` 子字串比對（A54 實作中修正，新知識點 KB-029）。全專案 119 個測試（+8）／typecheck／lint／`pnpm build` 全綠。已 commit（`a93fdbd`）＋push＋正式站部署驗證通過（web／worker 皆 `RUNNING`，worker 日誌確認正常啟動；本輪無新增 API 路由，改直接查詢正式站共用資料庫確認 `knowledge_sources` 2 筆／`knowledge_chunks` 43 筆正確寫入且 `status=draft`，`searchKnowledge()` 對書中詞彙查詢正確回傳 0 筆，安全閘門在正式站環境同樣生效）。已知限制：僅 2/38 章節、真實內容為 draft 尚未經人工最終校對、檢索僅子字串比對非語意理解、無向量檢索。

**E4-F2 主張與衝突模型完成（2026-07-19，Sprint 14，Feature 12/20）**：新增 `evidence_claims` 表（上游 §13.2 十三項欄位逐字對應）＋純服務層函式 `getClaimsForTopic()`，把知識來源切分內容轉換為結構化、可比較的醫學主張，並標記主張間的衝突狀態（上游 §13.3 七分類：`consistent`／`different_conditions`／`mixed_evidence`／`insufficient_evidence`／`not_applicable`／`source_outdated`／`source_withdrawn`），供 E4-F3 未來查詢與呈現；本輪無 API 路由或 UI。核心設計決策：`conflictStatus` 為人工標記、非系統自動判定（A62）——醫學衝突判斷需要語意理解，規則式演算法勉強分類反而比誠實地人工標記風險更高。**實作前重新評估推翻 DOR 草案的一項計畫**：原規劃另立 seed script 示範衝突情境（仿上游 §29 咖啡與骨質疏鬆範例），撰寫前發現此類示範必然要編造虛構研究內容，若以 `status=active` 寫入正式站共用資料庫，會被安全閘門判定為合格證據，未來 E4-F3 有誤引用風險；改為衝突情境示範資料只在測試檔內建立即刪除，不落地為 seed script（新知識點 KB-030）。真實王醫師書籍內容本輪未建立對應主張（A63）——目前僅 2 章節、內容為病患衛教敘事非研究型結構化資料，勉強詮釋套入 §13.2 欄位有扭曲原意風險。全專案 125 個測試（+6）／typecheck／lint／`pnpm build` 全綠。已 commit（`40d9eec`）＋push＋正式站部署驗證通過（web／worker 皆 `RUNNING`，worker 日誌確認正常啟動；本輪無新增 API 路由，改用臨時驗證腳本直接對正式站共用資料庫執行端到端功能驗證：`getClaimsForTopic()` 正確只回傳 `active` 來源主張、`draft` 來源正確排除，驗證用臨時資料已清除）。

**E4-F3 串流問答引擎 PoC 1/2 完成（2026-07-19，Sprint 15，Feature 13/20）**：新增 `conversations`／`messages`／`message_citations` 三表＋`OpenAiLlmAdapter`（Sprint 1 已定義的 `LlmAdapter` 介面首次落地實作）＋對話服務層，串接 E4-F1／E4-F2／E2-F4 三塊既有基礎，證明「引用驗證端到端」（05_BACKLOG 唯一 🔴 風險項）技術可行：LLM 被要求僅能用 `[OBS:uuid]`／`[SRC:uuid]` 標籤引用資料，驗證時確認 ID 未虛構＋資料合法存在（結構性檢查，非語意一致性核對，A74）。**已用真實 OpenAI API 呼叫驗證核心 PoC 目標成功**（AC-2／AC-10）。本輪拆為 PoC 1/2＋PoC 2/2（A69，比照 E2-F2 先例），不含 UI／`regenerate`／頻率限制（C17）／進階安全過濾（僅 prompt 約束＋關鍵字掃描，非分類模型，A73／A76，延續 E4-F2 A62 一貫原則）。開工前 LLM API key 尚未備妥（A68），PO 申請後寫入 `.env` 時因保留 `.env.example` 的註解符號 `#` 導致 dotenv 讀不到值，已用腳本移除該符號修正（全程未印出金鑰內容）。全專案 135 個測試（+10，含 2 項真實 API 呼叫）／typecheck／lint／`pnpm build` 全綠。已 commit（`8cf66a0`＋`36aff4f`）＋push＋正式站部署驗證通過——過程中發現 PO 存入 Zeabur 的 `OPENAI_API_KEY` 實際未存進去（第一次「已存檔」的畫面截圖顯示變數清單仍缺該筆），且 SSE 路由層的例外處理當時完全沒有記錄日誌，導致無法從 Zeabur 日誌診斷；已用本機重現＋`zeabur variable list`（重導向暫存檔＋`grep -c` 計數，未印出機密內容）定位根因、補上日誌、PO 重新存入變數＋重啟後，對正式站真實 HTTP 端點跑通完整事件序列（`stream_started → retrieval_completed → content_delta → citation_added → stream_completed`）。

**E4-F3 串流問答引擎 PoC 2/2 完成，E4 Epic 全數完成（2026-07-19，Sprint 16，Feature 14/20）**：補齊 PoC 1/2 刻意排除的四項——新增 `/projects/[id]/chat` 對話頁 UI、`regenerate`（`messages.regeneratedFromMessageId` 自我參照 FK，A78）、頻率限制（C17，每帳號每日 30 則問答跨專案累計，A79）、安全提示顯示層級打磨（A81，不自動攔截）。過程中修正 Sprint 15 遺留的潛在缺陷：`runAssistantMessage()` 原本無條件抓對話第一則訊息當提問，多輪對話／重新產生下會答非所問，改為沿 `regeneratedFromMessageId` 回溯＋抓最近一則使用者訊息的 `resolveQuestionText()`。**本機瀏覽器對正式站共用資料庫＋真實 OpenAI API 完整操作驗證**：建立對話→提問→即時串流顯示八段結構完整回答→引用清單正確顯示→點擊重新產生取得新版本、UI 正確只顯示最新版本；並意外驗證安全設計在真實情境下有效（問題超出提供資料範圍時，LLM 誠實回覆「資料不足」而非編造）。瀏覽器驗證過程中重新遇到既有已知限制 KB-020（未驗證帳號無法登入，與 C6 UI 文案矛盾），非本輪新增缺陷，透過 Supabase Admin API 標記測試帳號驗證繞過。全專案 140 個測試（+5）／typecheck／lint／`pnpm build` 全綠。已 commit（`9323781`）＋push＋**正式站部署驗證通過**：`deployment list` 確認 `RUNNING`、`/api/health` 200；依 KB-025 鐵則另跑正式站真實網域（`health-devkit.zeabur.app`）端到端功能驗證——因近期測試觸發 Supabase 寄信限流（`EMAIL_RATE_LIMITED`），改用 Admin API 直接建立＋確認測試帳號跳過寄信流程，於正式站 `/projects/{id}/chat` 實際提問並確認串流回答／引用／`regenerate` 皆在正式生產環境正確運作，驗證完畢後測試帳號（含 Supabase Auth）、專案、對話、合成知識來源已全數清除。

**E5-F1 行動計畫與安全規則引擎 Part 1/2 完成（2026-07-19，Sprint 17，Feature 15/20）**：E5 健康行動閉環第一個 Feature，核心是啟用前的安全把關（05_BACKLOG 風險標記「醫療安全核心」）而非計畫內容豐富度。新增三張表 `intervention_plans`／`intervention_actions`／`tracking_metrics` ＋服務層＋API，拆為 Part 1/2（本輪：資料模型＋安全審查＋API，不含 UI）＋ Part 2/2（Sprint 18：UI＋完整驗收），比照 E2-F2／E4-F3 PoC 拆分先例。核心設計決策：`activatePlan()` 的安全審查採**結構化欄位完整性檢查**（A87）——檢查計畫自身欄位（基準／風險／停止條件／轉介條件／檢討日）皆非空，且領先／結果／安全三分類指標各至少一筆，**不**對 `health_profiles` 內容做語意判讀，延續 A62／A73／A74 結構性而非語意驗證的一貫原則。已啟用計畫本輪不開放編輯（A89，版本鏈留待 Part 2/2）；`stopPlan()` 僅提供狀態轉換原語（A90，不良反應自動觸發鏈屬 E5-F2）。實作中發現並修正一個真實缺陷：`findOwnedPlan()` 初版把「無權限」與「不存在」collapse 成同一 `null`，導致跨帳號測試誤判為 `NOT_FOUND` 而非 `PROJECT_ACCESS_DENIED`；比照 `observations` 模組既有兩段式判斷慣例修正（KB-032）。全專案 150 個測試（+10）／typecheck／lint／`pnpm build` 全綠。已 commit（`6e48939`）＋push＋**正式站部署驗證通過**：`deployment list` 確認 `RUNNING`、`/api/health` 200；本輪無 UI，改用 `curl`＋Admin API 建立的測試帳號對正式站真實 API（`health-devkit.zeabur.app`）端到端驗證完整計畫生命週期——草稿建立→安全檢查失敗（`PLAN_SAFETY_INFO_REQUIRED`＋缺漏清單）→補齊資訊後啟用成功→編輯已啟用計畫遭拒（`INVALID_REQUEST`）→暫停/恢復/停止狀態轉換正確→跨帳號存取一律 `PROJECT_ACCESS_DENIED`（確認 KB-032 修正在生產環境生效）→軟刪除正確排除於列表，驗證完畢後測試帳號與資料已全數清除。

**E5-F1 行動計畫與安全規則引擎 Part 2/2 完成，E5-F1 正式結案（2026-07-19，Sprint 18，Feature 15/20）**：補齊 Part 1/2 刻意排除的兩項——`/projects/[id]/plans` UI 頁面、已啟用計畫的編輯（版本鏈）。核心設計：`PATCH /plans/{id}` 於 `active`／`paused` 狀態下改為新增列＋前版封存（A96，比照 `observations` A42），`intervention_actions`／`tracking_metrics` 子資源隨版本鏈複製一份新列（A97），調整後立即重新跑結構化安全檢查，欄位或指標不齊全時新版本強制降為 `needs_info`（A100，防止調整變成繞過啟用審查的後門）。`listPlans()` 比照 `messages` regenerate 排除已取代版本。實作中同步修正一項因版本鏈行為變更而過期的既有測試斷言。全專案 155 個測試（+5）／typecheck／lint／`pnpm build` 全綠。已 commit（`026a9dd`）＋push＋**正式站部署驗證通過**：`deployment list` 確認 `RUNNING`、`/api/health` 200；本輪有 UI，改用真實瀏覽器對正式站真實網域（`health-devkit.zeabur.app`）完整操作驗證——建立→啟用失敗缺漏提示→補齊資訊啟用成功→調整產生新版本＋3 筆指標正確帶入新版本＋列表僅顯示 1 筆最新版本（舊版本正確隱藏）→暫停/恢復/停止皆正確運作→戰情頁「行動計畫」導覽連結正確，驗證用測試帳號與資料已全數清除。**E5-F1 兩輪皆完成並部署驗證通過，正式結案。**

**E5-F2 日常回報與症狀事件模組完成（2026-07-19，Sprint 19，Feature 16/20）**：銜接 E5-F1，補上執行期間的日常追蹤（`check_ins`）與症狀事件回報（`symptom_events`）。核心設計：「不良反應暫停鏈」採**使用者明確標記，非系統自動判斷嚴重度**（A105）——`isAdverseEvent` 完全由使用者手動設定，設為 `true` 時立即呼叫 E5-F1 已預留的 `stopPlan(planId, "adverse_event")`（A90），系統不對症狀描述做語意分析自動判定。「因不良反應停止的計畫不得自動重新啟用」已由既有狀態機邏輯滿足（A106），本輪僅補回歸測試確認。`check_ins.value` 採自由文字非強制 numeric（A103）；`symptom_events` 本輪不提供 DELETE，只能補充或轉換狀態（A107）；`pausePlan`／`resumePlan`／`updatePlan` 於計畫因不良反應停止時，錯誤碼精緻化為上游 §24 逐字定義的 `PLAN_ADVERSE_EVENT`（A110）。UI 併入既有 `/projects/[id]/plans` 計畫詳情面板（A108）。全專案 164 個測試（+9）／typecheck／lint／`pnpm build` 全綠；本機瀏覽器完整操作驗證通過，包含核心情境：症狀事件回溯標記為不良反應後，計畫立即轉 `stopped`，UI 正確移除所有可能重新啟用的操作按鈕，驗證用測試帳號與資料已全數清除。**尚待**：PO 確認 commit／push／正式站部署時機。

下一步：commit／push／正式站部署驗證 Sprint 19；之後開 Sprint 20 DOR（依既定順序推進 E5-F3：定期檢討與無改善分類模組）。

## 16. 相關文件索引

- 上游完整規格：archive/個人健康檢查管理平台_規格整理_v1_2_2.md（含 §29 BDD、§30 Edge、§31 Abuse、§33 Stage 計畫）
- 技術選型：04_TECHNICAL_SPEC.md；Clarify 清單：CLARIFY_QUESTIONS.md

## 17. Clarify 決議定案值（C1–C22，2026-07-11 全數採建議預設值）

| 編號 | 定案值 |
|---|---|
| C1 | 起點採單一 app＋領域資料夾之簡化模組化單體，保留 Adapter 介面；packages 拆分延至 Worker 獨立部署時 |
| C2 | 第一版 PostgreSQL queue＋Queue Adapter；Redis 延後 |
| C3 | MVP 無管理 UI；知識來源以 seed script＋DB 維護，審核者＝PO |
| C4 | 第一版僅文字型 PDF（文字層抽取）；掃描 OCR 以 feature flag 延後 |
| C5 | Supabase 東京區；Web/Worker 平台由 PO 依帳務擇一後寫回 04 |
| C6 | 未驗證帳號可登入、可建專案；上傳與 AI 鎖定至驗證完成 |
| C7 | 15 分鐘內失敗 5 次鎖 15 分鐘，累犯翻倍 |
| C8 | Session 7 天滑動效期；不做記住我 |
| C9 | 重設 token 30 分鐘、單次有效 |
| C10 | 刪除 30 天冷靜期可撤銷，期滿背景永久刪除（含 Storage 與備份標記） |
| C11 | 註冊強制同意條款＋醫療免責聲明；未滿 18 歲不開放；條款需法律審查 |
| C12 | 單檔 ≤ 20MB、單 PDF ≤ 30 頁、每專案 ≤ 200 份（皆設定值） |
| C13 | 格式白名單：PDF、JPG、PNG；實際內容驗證 |
| C14 | 信心值 < 0.85 標示待確認（設定值） |
| C15 | 同日同項多筆全數保留、趨勢顯示多點、不自動平均 |
| C16 | AI 個人資料範圍：相關項目全歷史序列＋最近一次報告摘要，其餘按需檢索；token 預算為設定值 |
| C17 | 每帳號每日 30 則問答、每月 10 份報告（設定值），超量溫和提示 |
| C18 | AI 一律繁體中文回答 |
| C19 | 看診摘要固定模板（背景／期間趨勢／執行中計畫／症狀事件／想問醫師的問題），A4 可列印、PDF 匯出，範圍由使用者勾選 |
| C20 | 匯出＝JSON＋原始檔 ZIP，趨勢另附 CSV |
| C21 | 上游規格正名 v1.2.2 歸檔；本 SDD 自 v1.0.0 起算 |
| C22 | 以 WBS 拆解為唯一 Sprint 依據；規格 §33 與技術選型 §20 之 Stage 計畫降級為參考 |
