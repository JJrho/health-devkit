# Sprint 13 DOR — E4-F1：知識來源與檢索基座

> 狀態：**✅ 通過（PO 2026-07-19：確認 A54–A60 並通過 DOR，開工實作）**
> 對應：E4-F1（05_BACKLOG E4 表，🟡 風險、非 PoC、精估 1 個 Sprint）；SDD §4.8；上游規格 §13.1／§13.2／§17／§21.1／§23／Stage 7（archive/upstream_spec/個人健康檢查管理平台_規格_v1_0_0.md）；決議 C3（archive/previous_decisions/clarify-decisions-2026-07-11.md：MVP 無管理 UI，seed script＋DB 維護，審核者＝PO）；憲法 §3
> 前置依賴：E1-F1（技術棧骨架，pgvector extension 已於 Sprint 1 啟用）✅
> 建議 Sprint 順序（05_BACKLOG）：……E3-F1 → **E4-F1** → E4-F2 → E4-F3……——依既定順序本輪做 E4-F1

---

## 0. 開工前確認：首批知識來源整備狀況（外部依賴）

05_BACKLOG 將「首批知識來源整備」列為 E4-F1 的外部依賴（PO 提供）。開工前確認過程分兩階段：

1. **初次詢問**：PO 表示尚無現成內容，決定先用合成／範例資料跑通管線。
2. **PO 隨後提供真實來源**：本網站與一位合作醫師（**王健宇醫師**）有合作關係，該醫師已撰寫並出版多本通俗醫學衛教書籍，PO 提供其中一本《為什麼你的病總是看不好？這樣和醫生溝通，發現小毛病裡的大問題！》全書共 38 個章節（PART1～PART4，掃描 PDF，共 706 頁）作為知識庫種子內容。

**開工前資料品質查核（重要發現）**：PO 一併提供了同批內容先前已跑過 OCR 的 markdown 版本（`Leo-Dr-Wang_01/` 資料夾）。逐檔核對後發現**該 OCR 輸出有系統性辨識錯誤**——非個別錯字，是大範圍亂碼、字詞被拆散插入空白、甚至整句無法辨識（如「下組操戎取革地眉搞區甘、廚台吃主抽加十可瑟灰屆遞記島。」完全不成句）。這類內容若直接餵進知識庫，未來會被 AI 問答（E4-F3）引用回答使用者的健康問題，一旦因辨識錯誤扭曲醫學語意（如否定詞遺漏、症狀描述錯字），直接牴觸憲法 §3 醫療安全最高原則。**已向 PO 回報，暫停使用該批 markdown。**

改用 PO 另外提供的原始掃描 PDF（`personal-health-mgmt-DrWang/`）查核：抽樣兩個章節（共 11 頁）以 150 DPI 轉圖後逐頁目視確認，**掃描本身品質清晰、排版標準、完全可辨識**，證明問題出在先前的 OCR 工具、不是掃描品質。PO 與 AI 討論後決定：**本輪先處理這兩個已驗證品質的章節，逐頁由 AI 直接視覺閱讀＋人工轉錄成乾淨文字**（非自動 OCR，而是逐頁確認語意通順後才寫入），驗證整條 seed 管線；其餘 36 個章節（約 695 頁）留待後續迭代，屆時需要決定大量轉錄的具體方式（可能仍是逐頁人工校對，或尋找更好的 OCR／文件辨識工具，非本輪決定）。

**已完成的兩個試點章節**：
- 〈身為病人，你夠了解自己嗎？〉（PART1，頁 014–019，6 頁）
- 〈算得太精明，醫療品質不會好！〉（PART1-2，頁 020–024，5 頁）

**誠實揭露轉錄品質限制**：這兩章節的文字是 AI（Claude）逐頁視覺閱讀後的最佳判斷轉錄，比先前的自動 OCR 工具準確許多（有交叉核對目錄頁頁碼與章節標題皆吻合），但**仍非作者或 PO 本人逐字校對過的版本**，直排多欄版面在少數段落的閱讀順序判斷仍有出錯風險。建議正式大量使用前，作者或 PO 能抽查校對；本輪先以此驗證管線可行，`status` 暫設為 `draft`（見 A55 修正），不設為 `active`，避免未經人工最終確認的內容被未來 E4-F3 直接引用。

## 1. 需求描述

**範圍定位**：E4-F1 是知識庫的地基——建立可儲存、可全文檢索的知識來源與切分後內容，供 E4-F2（主張與衝突模型）與 E4-F3（AI 串流問答）未來使用。本輪**不含**管理 UI（C3 已定案：MVP 無管理 UI，來源以 seed script＋DB 直接維護，審核者＝PO 本人，「審核」意指 PO 在把內容寫進 seed script 之前先行人工確認，非系統內建審核流程）；**不含**主張抽取與衝突判斷（E4-F2 職責）；**不含**任何 API 路由或 UI（目前無消費者——E4-F2／E4-F3 尚未建置，比照 E2-F4 `standardizeDocument` 先做純服務層函式、由後續 Feature 呼叫的模式）。

四項交付：

1. **DB migration**：
   - `knowledge_sources`（知識來源）：`id`、`title`、`author`（可為 null，本輪真實內容會用到——如「王健宇 醫師」）、`sourceType`（`government`／`international_org`／`professional_society`／`peer_reviewed_guideline`／`vetted_education`，對應上游 §13.1 五級優先順序；醫師個人撰寫並出版的衛教書籍歸類為 `vetted_education`，本輪僅作標記＋未來排序依據，不強制驗證）、`url`（可為 null）、`publishedDate`、`status`（`draft`／`processing`／`active`／`inactive`／`withdrawn`／`failed`，上游 §17 逐字確認）、`version`、時間戳。
   - `knowledge_chunks`（切分後內容）：`id`、`sourceId` FK、`chunkIndex`、`content`（text）、時間戳；`content` 欄位加 `pg_trgm` GIN 索引（實作中修正，見 A54／KB-029：Postgres 內建 tsvector 全文檢索對中文不斷詞，改用 trigram 索引加速子字串查詢）。
   - **本輪不新增 `embedding`／`vector` 欄位**（見 A54，範圍排除）。
2. **切分工具**：`chunkText(fullText: string): string[]`，依段落／固定長度切分（純函式，獨立可測）。
3. **檢索函式**：`searchKnowledge(query: string): Promise<KnowledgeChunkResult[]>`——用 `ILIKE` 子字串比對（`pg_trgm` 索引加速，見 A54／KB-029），**只回傳 `status='active'` 來源底下的 chunk**（上游 §21.1「僅使用有效知識來源」），`inactive`／`withdrawn`／`draft`／`processing`／`failed` 一律排除。純服務層函式，本輪無 API 路由包裝。
4. **Seed script**：`scripts/seed-knowledge-sources.ts`（比照 `scripts/seed-test-definitions.ts` 冪等模式），寫入王健宇醫師《為什麼你的病總是看不好？》兩個試點章節的真實內容（見 §0），**`status` 設為 `draft`**（A55 修正：非合成資料，但也未經作者／PO 最終逐字校對，故不設為 `active`——避免未確認品質的內容被未來 E4-F3 檢索引用；待人工校對確認後，PO 可透過直接改資料庫的方式將 `status` 轉為 `active`，此為 seed 之後的手動操作，非本輪程式邏輯要處理的流程）。

## 2. 使用者角色

本輪無終端使用者互動介面（純後端基礎設施）；維護者為**系統管理者（PO 本人）**，透過 seed script 維護（C3）。

## 3. 操作流程

PO 人工審核內容來源可信度後，將內容寫入 seed script → 執行 seed script 寫入 `knowledge_sources`／`knowledge_chunks` → 未來 E4-F2／E4-F3 呼叫 `searchKnowledge()` 取得可用內容。本輪無使用者可見流程。

## 4. 輸入資料

| 輸入 | 來源 | 狀態 |
|---|---|---|
| 王健宇醫師《為什麼你的病總是看不好？》兩章節（頁 014–024，共 11 頁） | PO 提供掃描 PDF，AI 逐頁視覺閱讀轉錄（見 §0） | ✅ 已完成，待 seed |
| 同批書籍其餘 36 章節（約 695 頁） | PO 已提供掃描 PDF，轉錄方式待定 | 待補（非本輪阻塞項） |
| 該書先前的 OCR markdown 版本 | PO 提供，查核後發現系統性辨識錯誤 | ❌ 已否決，不使用（見 §0） |

## 5. 輸出結果

§1 四項交付；完成後知識來源與切分內容有正確的資料模型與可用的全文檢索函式，供 E4-F2／E4-F3 未來直接使用，不需重新設計資料表。

## 6. 驗收條件（Given／When／Then）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（狀態機） | `knowledge_sources` 資料表 | 檢查欄位定義 | `status` 欄位涵蓋上游 §17 六種狀態，型別與預設值正確 |
| AC-2（切分） | 一段多段落文字 | 呼叫 `chunkText()` | 正確切分為多個 chunk，無遺漏或重複內容 |
| AC-3（檢索：僅回傳 active） | 兩個來源，一個 `status=active`、一個 `status=draft`，皆有符合查詢字的 chunk | 呼叫 `searchKnowledge()` | 只回傳 `active` 來源的 chunk，`draft` 來源不出現 |
| AC-4（檢索：撤回來源排除） | 來源 `status=withdrawn` | 呼叫 `searchKnowledge()` | 不回傳該來源任何 chunk（上游「來源撤回後不得供新內容」） |
| AC-5（檢索：查無結果） | 查詢字與任何 chunk 皆不匹配 | 呼叫 `searchKnowledge()` | 回傳空陣列，非錯誤 |
| AC-6（seed 冪等） | 執行 seed script 兩次 | 檢查資料表 | 第二次不建立重複資料 |
| AC-7（日誌 P0） | 檢索與 seed 過程 | 掃描日誌 | 不含知識內容全文（避免大量非結構化文字意外入日誌） |
| AC-8（真實內容以 draft 入庫，A55） | 執行 `seed-knowledge-sources.ts` | 檢查資料表與 `searchKnowledge()` | 兩章節正確寫入 `knowledge_sources`（`status=draft`、`author="王健宇 醫師"`）與對應 `knowledge_chunks`；`searchKnowledge()` 用書中確實出現的詞查詢，因來源非 `active` 故**不會**回傳任何結果（驗證安全閘門生效：未經最終校對的真實內容不會被提早引用） |

## 7. Clarify 釐清

無新增 Clarify（本輪的知識來源整備狀態已於 §0 與 PO 確認）。

## 8. 可能影響的舊功能

無——本輪為全新獨立模組，不修改任何既有表／服務／路由。

## 9. 一個 Sprint 內可完成

05_BACKLOG 精估 1 個 Sprint、非 PoC、風險 🟡。範圍已收斂為「資料模型＋子字串檢索（trigram）＋切分工具＋seed script」，不含向量檢索、管理 UI、主張抽取。

## 10. 範圍排除

- **pgvector 向量檢索**（A54）——技術選型雖定案 FTS+pgvector 混合檢索，但向量檢索需要 embedding provider（依 10_SYNC.md 既有記錄，LLM key／embedding 供應商排在 E4-F3 之前才準備，本輪尚無），且向量維度取決於屆時選定的 embedding 模型，本輪貿然猜測維度數字寫死進 schema 有後續遷移風險；`embedding` 欄位留待供應商決定後再以新 migration 補上，不影響既有資料
- **Postgres 內建 tsvector 全文檢索**（A54 實作中修正，KB-029）——原規劃項目，實測後發現對中文不斷詞而放棄，改用 `pg_trgm` trigram 索引
- **知識來源管理 UI**——C3 已定案 MVP 不做，seed script＋DB 直接維護
- **主張抽取與衝突判斷**（`evidence_claims`）——E4-F2 職責，上游 §13.2／§13.3 定義的主張欄位與衝突狀態本輪不觸及
- **同批書籍其餘 36 章節（約 695 頁）的轉錄**——本輪僅完成 2 個試點章節，驗證管線可行；剩餘章節數量大，逐頁人工轉錄的方式是否適合放大規模、或需另尋更好的 OCR／文件辨識工具，留待下一輪決定，非本輪範圍
- **知識內容的人工最終校對／轉為 `active`**——本輪轉錄由 AI 逐頁視覺閱讀完成，非作者或 PO 逐字校對，故 seed 時 `status` 一律為 `draft`；校對並轉為 `active` 是後續的人工操作，非本輪自動化流程
- **API 路由**——目前無消費者（E4-F2／E4-F3 尚未建置），比照既有模式先做純服務層函式

## 11. 假設登記（待 PO 追認）

- **A54（實作中修正）**：本輪不實作 pgvector 向量檢索，理由不變（向量檢索需要 embedding provider，LLM／embedding 供應商決定排在 E4-F3 之前才會準備，10_SYNC.md 既有記錄；向量維度需視屆時選定模型而定，本輪貿然寫死維度數字有後續遷移風險；`embedding` 欄位留待供應商決定後以新 migration 補上）。**但檢索機制實作時發現原規劃的 Postgres 內建 FTS（`to_tsvector`）對中文完全不適用**——實測 `to_tsvector('simple', ...)` 對中文不斷詞，整段標點分隔的文字會變成單一詞元，查詢子字串（如「病人」）永遠比對不到，Postgres 標準文字搜尋設定檔皆無中文斷詞能力，需要額外的中文分詞擴充套件（如 zhparser，非 Supabase 標準可用擴充）。改用 `pg_trgm` trigram 索引＋`ILIKE` 子字串比對，雖不具語意理解，但對中文內容誠實可用、不需額外擴充套件（詳見 KB-029）。
- **A55（修正）**：本輪知識內容為**真實內容**——PO 提供的合作醫師（王健宇醫師）已出版衛教書籍《為什麼你的病總是看不好？》兩個試點章節，非合成資料。但轉錄方式是 AI 逐頁視覺閱讀（非作者/PO 逐字校對過），故 seed 時 `status` 一律設為 `draft`，不設 `active`，確保未經最終確認的內容不會被 `searchKnowledge()`（僅回傳 `active`）意外引用。其餘 36 章節（約 695 頁）留待後續迭代，比照 KB-023「先把管線與資料模型做對，覆蓋率是後續迭代的事」既有原則。
- **A56**：`sourceType` 五分類（對應上游 §13.1 優先順序）本輪僅作標記欄位，不實作優先順序邏輯或驗證規則——優先順序的實際應用（如衝突呈現時的來源可信度排序）屬 E4-F2／E4-F3 範圍。
- **A57**：C3「審核者＝PO 本人」在本輪的落地方式為：PO 在把內容寫進 seed script 之前先行人工確認可信度，不建立系統內建的審核工作流程／狀態轉換 UI。
- **A58**：本輪不建立任何 API 路由，`searchKnowledge()` 與 `chunkText()` 為純服務層函式，直接透過單元測試驗證，供 E4-F2／E4-F3 未來直接呼叫（比照 E2-F4 `standardizeDocument` 的既有模式）。
- **A59（新增）**：開工前查核發現 PO 先前提供的同批內容 OCR markdown 版本有系統性辨識錯誤（大範圍亂碼、詞語拆散、整句無法辨識），已確認問題出在先前使用的 OCR 工具、非原始掃描品質（抽樣掃描 PDF 逐頁目視確認清晰可辨識）。本輪**不使用**該批 markdown，改用 AI 直接視覺閱讀掃描 PDF 轉錄，僅先做 2 章節作為管線驗證。此決策對應憲法 §3 醫療安全最高原則：來源內容品質有疑慮時，寧可暫停使用並回報，不可為了「有內容能用」而降低品質把關。
- **A60（新增）**：`sourceType` 新增對「醫師個人撰寫並出版之衛教書籍」的分類判斷——歸類為 `vetted_education`（上游 §13.1 第五級「經審核的醫療院所衛教內容」），理由：雖非醫療院所官方發布，但作者具醫師資格、內容已正式出版、且與本平台有實際合作關係，屬性最接近此分類；不歸類為 `professional_society`（該級專指醫學會等機構本身發布的內容，非個人著作）。

## 12. 三層結構回溯

- Feature：**E4-F1**（E4 知識庫與串流問答引擎，1/3）
- SDD：§4.8；上游 §13.1／§13.2／§17／§21.1／§23／Stage 7
- 前置依賴：E1-F1 ✅（pgvector extension 已啟用，本輪僅未使用向量型別）

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」N/A（本輪無使用者可存取的資源，知識來源非專案層級資料）；「日誌掃描」適用但範圍不同（AC-7：知識內容全文不宜大量入日誌，非健康個資但屬非結構化大文本，同樣掃描把關）；「LLM Streaming」N/A（本輪無 AI 輸出）。**本輪額外要求**：SPRINT_LOG 需誠實記錄「本輪為王健宇醫師真實授權書籍內容，但僅 2/38 章節、且 `status=draft` 尚未經人工最終校對」「先前 OCR markdown 因品質問題已否決不用」「檢索為 trigram 子字串比對，非語意理解，也非向量檢索」，避免使用者誤以為知識庫已具備完整可信內容或語意檢索能力。
