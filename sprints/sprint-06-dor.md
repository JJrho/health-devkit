# Sprint 6 DOR — E2-F1：上傳會話與預覽模組

> 狀態：**✅ 通過（PO 2026-07-15：A18–A21 追認、DOR 通過）**
> 對應：E2-F1（05_BACKLOG E2 表，1 Sprint）；SDD §4.4；上游規格 §20（檔案與縮放規則）、§22.3（端點）、§28.3（上傳）、C12／C13；憲法 §1／§3／§4／§6
> 前置依賴：E1-F4 ✅（四層權限鏈，本模組首次真正掛載「文件屬於專案」這層）
> 外部依賴：**Storage bucket（尚未備妥，本輪需決定並建立，見第 11 節 A18）**

---

## 1. 需求描述 ✅

健檔文件上傳的**會話式生命週期**——分段、取消、重試、去重、預覽、signed URL 下載。本輪範圍**明確止於「uploaded」狀態**：實際 PDF 解析／OCR／信心值屬 E2-F2（下一個 PoC Feature），本輪不碰。五項交付：

1. **StorageAdapter 實作**：Sprint 1 已定義介面（`putObject`／`getSignedDownloadUrl`／`deleteObject`），本輪首次實作（A18：選用 Supabase Storage，見假設登記）。
2. **DB migration**：`documents` 表（`project_id` FK、`idempotency_key`、`filename`、`mime_type`、`size_bytes`、`storage_key`、`status`、`version`、`created_at`／`updated_at`／`deleted_at`）。`(project_id, idempotency_key)` 局部唯一索引（`WHERE deleted_at IS NULL`）——取消後可用同一 idempotency key 重新上傳，不被舊的已刪除紀錄卡住。可回滾。
3. **API 路由**（比照上游 §22.3 端點形狀，`project_id` 作路徑前綴、四層鏈套用）：
   - `POST /api/projects/{id}/documents/upload-sessions`：建立會話（`idempotencyKey` 必帶；同 key 且未刪除已存在則回既有會話，冪等）
   - `PUT /api/projects/{id}/documents/{document_id}/parts/{part_number}`：接收單一分段（暫存於 bucket 的 scratch 前綴，非最終位置；重複上傳同 part_number 直接覆寫，天然支援重試）
   - `POST /api/projects/{id}/documents/{document_id}/complete`：帶 `totalParts`；伺服器驗證 `part-1..part-N` 皆已收到 → 依序串接 → **驗證實際內容**（magic bytes 判斷 PDF/JPG/PNG，非僅信副檔名）→ 檢查大小（C12 ≤20MB）／PDF 頁數（C12 ≤30 頁）→ 上傳最終物件 → 刪除 scratch 分段 → `status=uploaded`
   - `DELETE /api/projects/{id}/documents/{document_id}`：取消（`uploading` 狀態）或刪除（`uploaded` 狀態）皆走軟刪除＋清 scratch／正式物件
   - `GET /api/projects/{id}/documents`：列表（排除已刪除）
   - `GET /api/projects/{id}/documents/{document_id}/preview`：回短效 signed URL（供前端 `<img>` 或後續 PDF.js 使用；憲法 §4：signed URL 不得入日誌）
4. **業務規則落地**：
   - C12：單檔 ≤20MB、單 PDF ≤30 頁、每專案 ≤200 份（於建立會話時檢查份數上限，於 complete 時檢查大小／頁數）
   - C13：格式白名單 PDF／JPG／PNG，**以 magic bytes 驗證實際內容**，不合格回 `FILE_TYPE_NOT_SUPPORTED`／`FILE_CORRUPTED`
   - 去重：以使用者端 `idempotencyKey` 判斷（AC 種子：「同一檔案已上傳完成，重複提交同 idempotency key，不建立重複文件」）——**不做**內容雜湊比對式去重（範圍排除，見第 10 節）
   - 四層鏈第 3 層「資源屬於專案」：`documents` 是第一個**真正有獨立資源 id 且會被巢狀操作**的資源（不像 `health_profiles` 是純 project-scoped 單例），查詢一律 `WHERE project_id = 已驗證專案.id AND id = document_id`，兩者缺一律回 `PROJECT_ACCESS_DENIED`（不區分「文件不存在」與「文件屬於別的專案」，防列舉）
5. **UI 頁面**：專案下的文件列表＋上傳（掛在專案工作區，上游 §6.2 十頁之一）。上傳前預覽（圖片縮圖／PDF 顯示檔名與大小卡片，見 A20 範圍縮減）、上傳中防重複提交、失敗可重試、可取消、已上傳清單含刪除。高齡優化沿用既有規範。
6. **測試**：四類齊備＋TDD 種子「同一 idempotency key 重複提交不建立重複文件」＋四層鏈「文件屬於專案」關鍵測試（比照 E1-F5 AC-4 的隔離測試手法，這次是真的有獨立 document id 可以拿錯專案的 id 去試）＋內容驗證測試（偽造副檔名但內容不符應被拒）。

## 2. 使用者角色 ✅

**終端使用者（本人）**，需 Email 已驗證（C6：上傳鎖定至驗證完成——`AUTH_REQUIRED` 之外，本輪需新增**驗證閘檢查**，回 `AUTH_REQUIRED` 或專屬提示，見 AC-8）。

## 3. 操作流程 ✅

進入專案 → 開啟文件頁 → 選擇檔案（先看到本地預覽）→ 送出建立上傳會話 → 上傳分段（MVP：前端固定送單一分段，見 A20）→ 呼叫 complete → 看到「已上傳」；失敗可重試同會話；上傳中可取消；已上傳文件可刪除、可透過 signed URL 預覽。

## 4. 輸入資料 ✅

| 輸入 | 來源 | 狀態 |
|---|---|---|
| `projects` 表與四層鏈基礎（E1-F4） | 已完成 | ✅ |
| Storage bucket | **本輪需決定與建立** | 🔶（A18：建議 Supabase Storage，本輪內完成，非外部前置作業） |
| PDF 頁數解析能力 | 需新增依賴 | 🔶（A19：`pdf-lib` 或同級輕量套件，僅用於算頁數，非解析內容） |

## 5. 輸出結果 ✅

§1 六項交付；完成後已驗證使用者可在自己的專案下上傳 PDF／JPG／PNG（符合大小與頁數限制），看到上傳前預覽，中斷可重試、可取消，重複提交不重複建立，且無法存取他人或其他專案的文件。

## 6. 驗收條件（Given／When／Then）✅

| # | Given | When | Then |
|---|---|---|---|
| AC-1 | 已驗證使用者、自己的專案 | 帶 `idempotencyKey` 建立上傳會話 | 建立成功，`status=uploading` |
| AC-2（TDD 種子） | 同一 `idempotencyKey` 的會話已存在且**未刪除** | 重複呼叫建立上傳會話 | 回傳既有會話（冪等），不建立第二筆 |
| AC-3 | 已建立會話 | `PUT` 分段 → `POST complete`（`totalParts` 與實際分段數一致） | 內容驗證通過（magic bytes）、大小／頁數符合 C12 → `status=uploaded`，回傳文件資訊 |
| AC-4 | 同上，但檔案實際內容非 PDF/JPG/PNG（例：把 .txt 改副檔名為 .pdf） | `complete` | 回 `FILE_CORRUPTED` 或 `FILE_TYPE_NOT_SUPPORTED`，`status=upload_failed`，不建立正式文件 |
| AC-5 | 同上，但檔案 >20MB 或 PDF >30 頁 | `complete` | 回 `FILE_TOO_LARGE`，`status=upload_failed` |
| AC-6 | 專案已有 200 份未刪除文件（C12 上限） | 再次建立上傳會話 | 回統一錯誤（`RATE_LIMITED` 或專屬訊息），不建立第 201 筆 |
| AC-7（四層鏈關鍵） | 自己名下專案 A、B；文件存在 A 底下 | 用 B 的 `project_id` 搭該 `document_id` 查／改／刪 | 回 `PROJECT_ACCESS_DENIED`——即使 A、B 皆本人所有，文件不屬於 B |
| AC-8 | 帳號 B 持有效 session／或未驗證帳號（C6） | 對他人專案操作、或未驗證帳號建立上傳會話 | 前者 `PROJECT_ACCESS_DENIED`＋稽核；後者回驗證閘專屬錯誤，不得建立會話 |
| AC-9 | 上傳中 | 使用者取消 | 會話與 scratch 分段皆清除，`status=deleted`，同 `idempotencyKey` 可重新上傳成功 |
| AC-10 | 已上傳文件 | 呼叫 preview 端點 | 回短效 signed URL；日誌不含該 URL（憲法 §4） |
| AC-11 | 全程 | 掃描日誌＋跑 a11y 檢查 | 日誌不含檔名／檔案內容／signed URL；上傳頁鍵盤可完成選檔、預覽、送出、取消、刪除全流程 |

## 7. Clarify 釐清 ✅

C12、C13 已定案，無新增。

## 8. 可能影響的舊功能 ✅

- 複用 `src/modules/projects` 的 `findOwnedProject`（第 1／2／4 層），新增 `documents` 專屬的「屬於專案＋比對 document_id」檢查（第 3 層首次有意義地生效，不同於 `health_profiles` 的單例情況）
- `queue_jobs`／`PgQueueAdapter`（Sprint 1）本輪**不使用**——E2-F1 止於「uploaded」，尚無需要 enqueue 的非同步工作；E2-F2 才會在 complete 之後 enqueue 解析工作
- `src/adapters/storage-adapter.ts` 介面不變，新增 `src/adapters/supabase-storage/` 實作
- `.env` 新增 Storage 相關設定（若 Supabase Storage 需要 bucket 名稱等非機密設定值，走 `.env.example` 佔位符慣例）

## 9. 一個 Sprint 內可完成 ✅

Backlog 精估 1 Sprint。範圍已明確止於 uploaded 狀態（不含解析）；四層鏈框架、error envelope、OCC 版本模式皆已在前兩輪建好，本輪主要新工作是 Storage 整合＋內容驗證＋分段會話狀態機，複雜度可控。

## 10. 範圍排除 ✅

- **PDF 解析／OCR／信心值／頁面座標**——E2-F2（下一個 PoC Feature）
- **內容雜湊式去重**（同檔案不同 idempotency key 也偵測重複）——本輪僅做 idempotency-key 去重（符合明確 AC），內容比對留待有實際需求時再評估，避免無依據擴大範圍
- **惡意檔案掃描**（上游 §20 明列，但 05_BACKLOG 對 E2-F1 的外部依賴只列「Storage bucket」，未含 AV 掃描服務）——**本輪不做，登記為缺口而非靜默略過**（A21）
- **PDF 首頁縮圖預覽**——上傳前預覽以「檔名＋大小＋（圖片檔才有）縮圖」為主，PDF 顯示資訊卡片，不即時渲染首頁（A20）
- **前端真正的分段切割上傳**（大檔案分批送出、可續傳）——後端 API 合約支援多分段，但本輪前端固定單一分段送出整個檔案（≤20MB 一次送出可接受），真正分段留待有實際網路不穩需求時再做（A20）
- **正式檢驗紀錄／observations／dashboard**——待 E2-F3／E2-F4／E3 才會出現

## 11. 假設登記（待 PO 追認）

- **A18**：Storage bucket 選用 **Supabase Storage**（S3 相容私有儲存，符合 04_TECHNICAL_SPEC §1 決策）而非另立 Zeabur MinIO/RustFS 服務。理由：(1) 同一 Supabase 專案、同區域（Tokyo）、共用既有 `SUPABASE_SERVICE_ROLE_KEY`，零新增基礎設施；(2) 若另開 Zeabur 物件儲存 service，會是第三個 Zeabur service，增加 KB-013 記載的伺服器資源壓力與維運複雜度；(3) `@supabase/supabase-js` 已是既有依賴，其 `.storage` API 即可滿足 `putObject`／`getSignedDownloadUrl`／`deleteObject` 三個 adapter 方法，不需額外引入 AWS S3 SDK。**上傳走伺服器端中介**（瀏覽器 → 我方 API → Supabase Storage），不做瀏覽器直連 Supabase Storage 的 resumable/TUS 上傳——因為本站的 session 系統與 Supabase Auth JWT 脫鉤（`persistSession:false`），Storage RLS 政策慣用的 `auth.uid()` 在本架構下無法自然對應，直連會需要另一套授權機制，複雜度不划算。
- **A19**：PDF 頁數檢查需新增輕量依賴（`pdf-lib` 或同級套件，僅用於讀取頁數，不做內容解析），非機密、非外部服務，屬一般 npm 套件新增。
- **A20**：上傳前預覽與分段上傳皆採 MVP 簡化版（見第 10 節範圍排除），API 合約保留未來擴充空間（`part_number`／`totalParts` 皆已存在），不鎖死架構。
- **A21**：上游 §20「執行惡意檔案掃描」本輪**不實作**，登記為明確缺口——05_BACKLOG 對 E2-F1 的外部依賴未列 AV 掃描服務，屬規劃遺漏或刻意延後；本輪以「內容驗證（magic bytes）＋大小/頁數上限＋僅限已驗證帳號」作為第一道防線，正式惡意檔案掃描建議排入 E6-F2（整合測試與部署交付包）或另立待辦，非本輪範圍。

## 12. 三層結構回溯 ✅

- Feature：**E2-F1**（E2 健檢資料入庫管線，1/4）
- SDD：§4.4；上游 §20／§22.3／§28.3；C12／C13
- 前置依賴：E1-F4 ✅

## 13. DOD 適用性備註

追加三條中：「四層權限鏈測試」為本輪 P0（AC-7／AC-8，`documents` 首次是有獨立 id 的巢狀資源）；「日誌掃描」為本輪 P0（AC-11：檔名、內容、signed URL 皆不得入日誌，比 E1-F5 的 `data` 欄位更廣——連檔名都算隱私）；「LLM Streaming」N/A。本輪額外建議 DOD：**A21（惡意檔案掃描缺口）需在 SPRINT_LOG 與 KB 明確記錄，不得因為「規格沒列外部依賴」就當作不存在的需求**。
