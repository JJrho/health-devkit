# Sprint 15 DOR — E4-F3：SSE 串流問答引擎（PoC 1/2）

> 狀態：**✅ 通過（PO：確認 A68–A77 並通過 DOR，OpenAI Responses API 已申請完成）**
> 對應：E4-F3（05_BACKLOG E4 表，🔴 風險「引用驗證端到端」、**PoC**、精估 2 個 Sprint，C16–C18）；SDD §4.9；上游規格 §21／§22.5／§17／§18.2／§23／§24／§29（Gherkin「有來源的健康問答」）／Stage 10；技術選型 §11.1–§11.5；憲法 §3（LLM 輸出必須 Streaming）
> 前置依賴：E4-F2（主張與衝突模型）✅、E2-F4（正式紀錄）✅ 皆已完成
> 建議 Sprint 順序（05_BACKLOG）：……E4-F1 → E4-F2 → **E4-F3（PoC）×2** → E5-F1……——依既定順序本輪做 E4-F3，因規模與風險大，拆為 PoC 1/2（本輪）＋ PoC 2/2（下一輪）

---

## 0. 開工前確認：LLM API key 準備狀況（外部依賴）

05_BACKLOG 將「LLM API key」列為 E4-F3 的外部依賴。開工前確認：本機 `.env` 尚未設定 `OPENAI_API_KEY`（僅確認布林值，未讀取內容）。**PO 決定：先申請 key，同時請 AI 先擬好本輪 DOR 假設**（兩件事並行）。

因此本輪 DOR 涵蓋完整假設與範圍規劃；若開工時 key 仍未到位，schema／adapter 骨架／retrieval／citation 驗證邏輯的「單元測試可覆蓋部分」仍可先行，但**核心 PoC 目標（真實 LLM 串流呼叫＋引用驗證端到端）需等 key 到位才能真正驗證**，屆時若跨過 Sprint 邊界，將誠實記錄「PoC 邏輯完成但尚未用真實 API 驗證」而非宣稱已驗證通過。

## 1. 需求描述

**範圍定位**：E4-F3 是整個知識庫與問答系統的收官功能——串接 E4-F1（知識檢索）、E4-F2（主張與衝突）、E2-F4（正式檢驗紀錄）三塊既有基礎，讓使用者對自己的健康資料提問，AI 以 SSE Streaming 回答，且每句醫學敘述皆可回查來源（憲法 §3 最高原則之一）。

**本輪（PoC 1/2）聚焦於證明技術可行性最高風險的一環——引用驗證端到端**：真實呼叫 LLM、取得回答、驗證回答中的每個引用皆可追溯、不虛構，這是 05_BACKLOG 唯一標記 🔴 的風險項。其餘功能完整度（八段結構嚴謹度、進階安全過濾、UI、取消／重新產生的完整體驗）留待 PoC 2/2（Sprint 16）打磨。

四項交付：

1. **DB migration**：三張新表（上游 §23）——
   - `conversations`：`id`、`projectId`（FK，四層鏈第 1 層資源）、`title`（nullable，可為 null 由前端自行從首則訊息摘要，本輪不強制）、`createdAt`、`updatedAt`、`deletedAt`（軟刪除，比照既有慣例）
   - `messages`：`id`、`conversationId`（FK）、`role`（`user`／`assistant`）、`content`（text，助理訊息最終組裝內容；使用者訊息即原文）、`status`（上游 §17「AI 訊息」六狀態逐字：`queued`／`retrieving_sources`／`safety_check`／`streaming`／`completed`／`blocked`／`failed`／`cancelled`，八值，見 A70 狀態機落地）、`errorCode`（nullable，對應上游 §24 錯誤碼，如 `AI_INSUFFICIENT_DATA`）、`version`（整數，為未來 PoC 2/2 的「重新產生建新版本」預留，本輪不做多版本邏輯）、`createdAt`、`updatedAt`
   - `message_citations`：`id`、`messageId`（FK）、`citationType`（`observation`／`knowledge_chunk`）、`observationId`（nullable FK）、`knowledgeChunkId`（nullable FK，恰有一者非 null）、`citedText`（LLM 實際引用的原文片段，供人工／未來自動核對）、`createdAt`
2. **`LlmAdapter` 的 OpenAI 實作**：`src/adapters/openai-llm-adapter.ts` 實作 Sprint 1 已定義的既有介面（`streamCompletion(request): AsyncIterable<LlmStreamChunk>`，`text`／`done` 兩種 chunk），使用 OpenAI Responses API（技術選型 §11.2 定案）。
3. **對話服務層**（`src/modules/conversations/`）：
   - `createConversation()`、`sendMessage()`（建立使用者訊息＋觸發助理訊息生成）
   - 助理訊息生成管線依上游 §18.2 狀態機：`queued → retrieving_sources → safety_check → streaming → completed`（或於任一階段轉 `blocked`／`failed`；`streaming → cancelled`）
     - `retrieving_sources`：呼叫既有 `searchKnowledge()`（E4-F1）＋`getClaimsForTopic()`（E4-F2，若問題可對應 topicKey）＋讀取專案 `observations`（C16：相關項目全歷史序列＋最近一次報告摘要）
     - `safety_check`：檢查檢索結果是否為空（空則直接 `blocked`＋`AI_INSUFFICIENT_DATA`，比照上游 Gherkin「資料不足時明確說明」）；否則組裝帶引用標記的 system prompt（見 A73）
     - `streaming`：呼叫 `LlmAdapter.streamCompletion()`，逐 chunk 透過 SSE 轉發給前端，同時累積組裝完整內容
     - 完成後執行**引用驗證**（技術選型 §11.5 六項檢查，見 A74 落地方式），驗證失敗的引用直接從回應中剔除並記錄（不整則回應失敗，見 A74）
   - `cancelMessage()`：觸發既有 `LlmAdapter` 呼叫時傳入的 `AbortSignal`，狀態轉 `cancelled`
4. **API 路由**：
   - `POST /api/projects/{id}/conversations`
   - `POST /api/projects/{id}/conversations/{conversationId}/messages`
   - `GET /api/projects/{id}/conversations/{conversationId}/messages/{messageId}/stream`（SSE）
   - `POST /api/projects/{id}/messages/{messageId}/cancel`
   四層權限鏈（登入→專案擁有權→對話屬於專案→未刪除）比照既有模組模式（`findOwnedProject` 延伸）。

## 2. 使用者角色

專案擁有者（一般使用者）：在自己的健康專案內提問，取得有來源的 AI 回答。

## 3. 操作流程

使用者於工作區選擇專案 → 開啟／建立對話 → 輸入問題 → 前端透過 SSE 即時顯示回答（本輪無 UI，見 A75，以 script／整合測試模擬 SSE 消費）→ 回答完成後可查看引用來源清單。

## 4. 輸入資料

| 輸入 | 來源 | 狀態 |
|---|---|---|
| 使用者提問文字 | 使用者輸入 | 待驗證輸入不可信（上游 §21.1「使用者輸入與文件內容皆視為不可信」） |
| 個人檢驗資料 | 專案既有 `observations`（E2-F4） | ✅ 已完成，本輪查詢使用 |
| 知識來源與主張 | `knowledge_chunks`／`evidence_claims`（E4-F1／E4-F2） | ✅ 已完成；真實內容皆 `draft`，PoC 測試需另建合成 `active` 來源（見 A72） |
| OpenAI API key | PO 申請中 | ⏳ 待補（見 §0） |

## 5. 輸出結果

§1 四項交付；完成後使用者可對真實或合成健康資料提問，取得 Streaming 回答，且每句醫學／個人敘述皆有可驗證的引用來源，證明「引用驗證端到端」技術可行。

## 6. 驗收條件（Given／When／Then，草案，待 PO 確認）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（狀態機） | `messages` 資料表 | 檢查欄位定義 | `status` 涵蓋上游 §17 八值，型別與預設值正確 |
| AC-2（有來源的健康問答，上游 §29） | 專案有至少兩筆已確認的相同檢驗項目＋一個合成 `active` 知識來源 | 使用者詢問該項目長期變化 | 回答以 Streaming 方式產生；個人結論引用該筆 `observation`；一般知識引用該 `knowledge_chunk`；回答不含診斷式語言（人工檢閱＋關鍵字掃描雙重把關，見 A76） |
| AC-3（引用驗證：合法引用通過） | LLM 回答中的引用標記對應真實存在、屬於本專案、來源 active 的資料 | 執行引用驗證 | 該引用保留在最終回應中 |
| AC-4（引用驗證：虛構引用剔除） | 合成情境讓 LLM 引用不存在的 ID（透過刻意簡化的 prompt 誘發，或直接單元測試驗證函式） | 執行引用驗證 | 該引用被剔除，不出現在最終回應／`message_citations` |
| AC-5（引用驗證：跨專案資料排除） | 引用標記指向存在但屬於另一專案的 `observation` | 執行引用驗證 | 該引用被剔除（四層鏈延伸） |
| AC-6（資料不足） | 專案無任何已確認資料、無合成知識來源 | 使用者提問 | 訊息狀態轉 `blocked`，`errorCode=AI_INSUFFICIENT_DATA`，不呼叫 LLM（節省成本＋不編造） |
| AC-7（取消） | 訊息處於 `streaming` 狀態 | 呼叫 cancel 端點 | `AbortSignal` 觸發，狀態轉 `cancelled`，已串流的部分內容保留（上游「串流中斷保存已完成內容」） |
| AC-8（四層權限鏈） | 對話存在專案 A | 其他帳號或專案 B 存取 | 一律 `PROJECT_ACCESS_DENIED`，比照既有模式 |
| AC-9（日誌 P0） | 整段對話流程 | 掃描日誌 | 不含使用者提問全文、AI 回答全文、完整 prompt、健康資料內容（上游 §21.1「日誌不得記錄完整健康內容與完整 Prompt」） |
| AC-10（繁體中文，C18） | 任意提問 | 取得回答 | 回答語言為繁體中文 |

**本輪 AC 範圍排除**：八段結構嚴謹度驗證（僅驗證「可解析」非「每段皆完整」）、規則式安全過濾的對抗測試、`regenerate`、頻率限制（C17）、UI 互動驗證——留待 PoC 2/2。

## 7. Clarify 釐清

無新增 Clarify；本輪高不確定性項目以假設方式登記（A68–A77），待 PO 於通過 DOR 時一併追認，其中 A68（LLM key 時程）性質特殊，可能需視申請進度於開工後補充確認。

## 8. 可能影響的舊功能

無直接修改——`conversations`／`messages`／`message_citations` 為全新表；查詢既有 `observations`／`knowledge_chunks`／`evidence_claims` 皆為唯讀，不變更其邏輯。

## 9. 一個 Sprint 內可完成

05_BACKLOG 精估 2 個 Sprint、**PoC**、風險 🔴。本輪已限縮為「schema＋adapter＋核心狀態機＋引用驗證＋單一 Gherkin 情境端到端證明」，不含 UI／regenerate／進階安全／頻率限制，符合單 Sprint PoC 1/2 的合理範圍（比照 E2-F2 PoC 1/2 先證明技術可行、PoC 2/2 再打磨準確率的既有節奏）。

## 10. 範圍排除

- **UI／前端對話介面**——本輪純後端＋API，比照 E2-F2 PoC 1/2「先證明管線可行」模式，透過 script／整合測試直接消費 SSE 端點驗證（A75）
- **`regenerate`（重新產生）**——`messages.version` 欄位本輪僅預留，邏輯留待 PoC 2/2
- **頻率限制（C17：每帳號每日 30 則問答）**——本輪不實作限流邏輯，留待 PoC 2/2 或正式功能完善階段
- **`GET /conversations` 列表端點、`reports` 系列端點**——上游 §22.5 一併列出，但 `reports` 在 §23 主要資料表中無對應表（`plan_reviews`／`escalation_summaries` 屬 E5-F3／F4），判斷為不同 Feature 範圍，本輪不觸及
- **向量檢索／rerank**（技術選型 §11.4 完整 RAG pipeline 的一部分）——延續 E4-F1 A54 既有範圍排除，retrieval 僅用既有 `searchKnowledge()`（trigram 子字串）＋`getClaimsForTopic()`，不做語意向量搜尋
- **進階安全過濾（規則引擎／額外分類模型）**——本輪安全把關僅靠 system prompt 約束＋檢索結果為空時阻擋，非獨立的內容審查層，見 A76
- **`chunkId`／`observationId` 語意一致性的自動驗證**（技術選型 §11.5「claim 與引用段落一致」逐字要求）——本輪僅做結構性驗證（引用的 ID 確實存在於本輪提供給模型的上下文中，未被虛構），非語意層面驗證模型有沒有曲解原文，見 A74

## 11. 假設登記（待 PO 追認）

- **A68（新增）**：LLM API key 由 PO 申請中，與本 DOR 撰寫並行。**理由**：見 §0；若開工時仍未到位，先完成不需真實 API 呼叫的部分（schema、四層權限鏈、citation 驗證函式的合成資料單元測試），真正的端到端 Streaming 驗證待 key 到位後立即補做，誠實記錄實際完成度，不假裝已用真實 API 驗證過。
- **A69（新增）**：E4-F3 拆分為 PoC 1/2（本輪，Sprint 15）＋ PoC 2/2（Sprint 16）。**理由**：05_BACKLOG 本身已估 2 個 Sprint、標記 PoC；比照 E2-F2 先例（Sprint 7 PoC 1/2 證明 pdfjs 可行、Sprint 8 PoC 2/2 打磨準確率），本輪聚焦證明最高風險項（引用驗證端到端）與核心管線可行，UI／進階安全／頻率限制／重新產生留待下一輪。
- **A70（新增）**：`messages.status` 狀態機依上游 §17／§18.2 逐字落地八值（`queued`／`retrieving_sources`／`safety_check`／`streaming`／`completed`／`blocked`／`failed`／`cancelled`），狀態轉換規則見 §1 交付項 3。
- **A71（新增）**：`conversations`／`messages` 皆掛專案層級（`projectId` 直接外鍵於 `messages` 所屬 `conversations`），四層權限鏈比照 `documents`／`observations` 既有模式（第 3 層「資源屬於專案」在 `conversations` 生效，`messages`／`message_citations` 透過 `conversations` 間接歸屬）。
- **A72（新增）**：測試資料為合成資料，且需額外建立至少一筆 `status=active` 的合成知識來源（區別於 E4-F1 真實內容皆為 `draft` 不可被檢索的既定安全閘門）。**理由**：真實王醫師書籍內容全數為 `draft`（A55 既定安全設計），若不建合成 active 來源，PoC 將永遠測不到「有知識引用」的情境；比照 `knowledge-service.test.ts`／`evidence-claims-service.test.ts` 既有的暫時性合成資料模式（測試結束即刪除，不留存於資料庫），避免虛構內容比照 KB-030 教訓意外留存。
- **A73（新增）**：`safety_check` 步驟的 PoC 落地方式——(1) 檢索結果為空時直接 `blocked`＋`AI_INSUFFICIENT_DATA`，不呼叫 LLM；(2) 組裝 system prompt 明確禁止診斷式語言、藥物劑量／停藥／治療保證（上游 §21.1 逐字要求），並要求所有引用一律使用我方提供的 ID 標記（如 `[OBS:<uuid>]`／`[SRC:<uuid>]`），不得自行產生 URL 作為來源（技術選型 §11.5「不允許模型自行產生 URL 作為來源」）。**不做**規則式關鍵字過濾器或額外分類模型偵測回答是否違規——理由同 E4-F2 A62：勉強做一個看似能偵測、實際不可靠的過濾器，比誠實地依賴 prompt 約束＋人工抽查更危險（會給人虛假的安全感）；正式上線前的更嚴謹防護（如輸出後二次審查）留待 PoC 2/2 或更後續階段評估。
- **A74（新增）**：引用驗證（技術選型 §11.5 六項）的 PoC 落地範圍——citation target 存在、來源 active、資料屬於目前專案、資料未刪除、不允許模型自產 URL，皆為**結構性檢查**（查資料庫確認 ID 真實存在且屬性正確）；「claim 與引用段落一致」簡化為**ID 未虛構**（模型引用的 ID 必須是我方在 context 中實際提供過的，而非模型自己編造的 ID），不做語意層面「模型有沒有曲解原文」的深度核對（需要額外 NLI 模型或二次 LLM 呼叫，超出 PoC 範圍）。**理由**：這正是 05_BACKLOG 標記的最高風險項——先證明「結構化 ID 引用機制」這個技術路線本身可行（LLM 是否真的會遵循我方要求的引用格式、我方是否真的能可靠驗證），語意層面的精準度屬於後續迭代的品質打磨，非本輪存在與否的可行性問題。
- **A75（新增）**：本輪不建立 UI，透過 script／整合測試直接呼叫 SSE 端點、消費事件流驗證。**理由**：比照 E2-F2 PoC 1/2「先證明後端管線可行，UI 留給下一階段」的既有模式；SSE 串流 UI（可取消、可重連、依 sequence 去重）涉及不少前端工程量，且必須等後端管線確認可行後再投入才不會白工。
- **A76（新增）**：AC-2「回答不得宣稱已診斷疾病」的驗收方式為**人工檢閱＋關鍵字掃描雙重把關**（掃描回答文字是否含「你得了」「確診」「診斷為」等明顯診斷式用語作為警示，非嚴謹的語言學分析），非自動化語意判斷。**理由**：與 A73 同一脈絡，PoC 階段誠實地用有限但明確的方式把關，不假裝有超出目前能力的自動化保證。
- **A77（新增）**：`reports`（§22.5 後半段）與 `GET /conversations` 列表端點不在本輪範圍。**理由**：`reports` 在上游 §23 主要資料表清單中找不到對應表（`plan_reviews`／`escalation_summaries` 屬 E5-F3／F4 範圍），判斷屬不同 Feature；列表端點非本輪 PoC 驗證引用機制所必需，且無 UI 消費者（A75）。

## 12. 三層結構回溯

- Feature：**E4-F3**（E4 知識庫與串流問答引擎，3/3，PoC 1/2）
- SDD：§4.9；上游 §21／§22.5／§17／§18.2／§23／§24／§29／Stage 10；技術選型 §11.1–§11.5
- 前置依賴：E4-F2 ✅、E2-F4 ✅

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」適用（AC-8）；「日誌掃描」適用（AC-9，範圍擴大為使用者提問全文＋AI 回答全文＋完整 prompt，非僅健康數值）；「LLM Streaming」為本輪核心要求，**必須**為 SSE（憲法 §3 硬性規定，介面設計已在 Sprint 1 從型別層面排除非串流實作）。**本輪額外要求**：SPRINT_LOG 需誠實記錄「引用驗證為結構性檢查（ID 未虛構），非語意一致性深度核對」「安全把關依賴 prompt 約束＋關鍵字掃描，非獨立分類模型」「若 LLM key 未及時到位，如實記錄實際完成度與待驗證項目」，避免使用者或後續開發者誤以為系統已具備語意層級的引用驗證或強健的內容安全過濾能力。
