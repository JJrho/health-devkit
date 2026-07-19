# Sprint Log — 個人健康檢查管理平台

> 目前狀態：Sprint 14 ✅ 已 commit（`40d9eec`）＋push＋正式站部署驗證通過（2026-07-19）——**E4-F2：主張與衝突模型（七狀態）**。實作前重新評估發現：若把示範用的虛構「衝突」情境資料以 `status=active` 寫入正式站共用資料庫，未來 E4-F3 可能誤把虛構研究當真實證據引用，已改為測試檔內建立即刪除，不落地為 seed script（KB-030）。

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
