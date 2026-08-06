# Sprint 27 DOR — E8-F1：每日自動備份（資料庫＋Storage → Cloudflare R2）

> 狀態：**✅ 通過並結案（PO 已確認，2026-08-05～2026-08-06）**
> 對應：E8-F1（05_BACKLOG 新增 Epic E8：維運與備份自動化）；KNOWN_ISSUES.md「已解決」區（原第 2 項「Supabase 免費方案無自動備份」）
> 前置依賴：備份帳號層級設定（Supabase Session pooler 連線字串＋R2 bucket／API Token，PO 提供）
> 精簡說明：本輪為 CI 排程腳本＋GitHub Actions workflow，不觸碰 app 執行期程式碼／資料表結構，DOR 依既有精簡慣例撰寫。
>
> **實作後變更（A158，KB-042）**：DOR 原訂上傳目的地為 Google Drive（帳號層級設定已完成：service account、Drive API、Drive 資料夾共用），但正式站部署驗收時撞上 Google 平台限制——service account 對個人 Gmail Drive 沒有儲存配額（`HTTP 403 storageQuotaExceeded`，Google 官方訊息明確指出僅 Shared Drives／OAuth domain-wide delegation 可行，兩者皆為 Google Workspace 專屬功能），非程式碼問題可解，PO 決定改用 Cloudflare R2（S3 相容 API）。以下 §4／§9 假設登記中提及 Google Drive 之處，實作結果請一律以 R2 為準；完整經過見 KB-042。另外，資料庫還原驗證（AC-2）實際除錯過程踩過五層真實環境問題（PGDG 套件庫、pg_dump 版本解析、schema 衝突、擴充套件注入順序、search_path 清空），完整記錄見 KB-041。

---

## 1. 需求描述

KNOWN_ISSUES.md 第 2 項記錄本專案 Supabase 免費方案完全沒有自動備份、也不提供 PITR（Sprint 24 查證，KB-035），正式站資料庫目前沒有平台層級的還原安全網。本輪補上應用層級的每日自動備份：資料庫（`pg_dump`）＋Storage 物件，皆打包上傳至 PO 個人 Google Drive 資料夾，並自動清除超過 14 天的舊備份。

## 2. 使用者角色

- PO／未來維護者：需要一份「即使 Supabase 專案本身出事，仍能從 Google Drive 找回最近 14 天內某一天的資料庫與檔案」的備份機制，且這份備份必須是**已驗證過真的能還原**的，不是「有備份的樣子」。

## 3. 操作流程

GitHub Actions 排程（每日 UTC 18:00＝台灣時間凌晨 2 點）或 PO 手動於 GitHub Actions 頁面點選「Run workflow」觸發 → workflow 依序：① `pg_dump` 資料庫（僅 `public` schema）② 在乾淨的一次性 Postgres 環境還原剛產生的 dump 並驗證 ③ 列出 Storage 所有 bucket 的所有物件、下載、打包 ZIP ④ 兩份備份皆上傳至 Google Drive 指定資料夾 ⑤ 清除資料夾內超過 14 天的舊備份（依檔名日期判斷）。任一步驟失敗，整個 workflow run 標記失敗（GitHub 會寄失敗通知信到 repo owner 信箱），不會安靜產出一份實際壞掉的備份。

## 4. 輸出結果

- 每次成功執行後，Google Drive「health-devkit-backups」資料夾新增兩個檔案：`db-backup-YYYY-MM-DD.sql`、`storage-backup-YYYY-MM-DD.zip`
- 每次執行皆自動驗證資料庫備份「真的能還原」（見 A156），非僅本輪驗收測一次
- 資料夾內超過 14 天的舊檔案自動清除

## 5. 驗收條件（Given／When／Then）

| # | Given | When | Then |
|---|---|---|---|
| AC-1（DB 備份產生） | Secrets 皆已就緒 | workflow 執行 | 產生 `db-backup-{today}.sql`，內容為 `public` schema 完整 dump |
| AC-2（DB 還原驗證） | AC-1 完成 | 對一次性 Postgres 服務容器執行 `psql -v ON_ERROR_STOP=1` 還原 | 還原過程零錯誤，還原後資料表清單與本專案已知 24 張表一致 |
| AC-3（Storage 備份產生） | Secrets 皆已就緒 | workflow 執行 | 產生 `storage-backup-{today}.zip`，內含所有 bucket 的所有物件 |
| AC-4（上傳 Drive） | AC-1／AC-3 完成 | 上傳步驟執行 | Google Drive 指定資料夾出現兩個新檔案，檔名含當日日期 |
| AC-5（保留天數） | Drive 資料夾內有 >14 天前的備份檔案 | 清理步驟執行 | 超過 14 天的檔案（依檔名日期判斷）被刪除，14 天內的保留 |
| AC-6（手動觸發） | workflow 已部署 | PO 或 AI 於 GitHub Actions 手動觸發一次 | 全流程成功、Drive 出現當日兩個檔案，作為本輪最終驗收證據 |
| AC-7（失敗即失敗） | 任一步驟出錯（如憑證失效、API 額度用盡） | workflow 執行 | 整個 run 標記失敗，不產生看似成功實則不完整的備份 |

## 6. 可能影響的舊功能

無——純新增 CI workflow 與獨立 `scripts/backup/` 腳本，不修改任何 app 執行期程式碼、路由、資料表結構。

## 7. 本任務可在一個 Sprint 內完成

是——邏輯集中在兩支腳本＋一個 workflow yaml，無新資料表、無新 UI。

## 8. 範圍排除

- **不備份 Supabase 內部 schema（`auth`／`storage`／`realtime` 等）與角色／擴充套件定義**：見 A152，僅備份 `public` schema（本專案應用程式自己的 24 張表）。**明確揭露限制**：這代表 Supabase Auth 使用者身份（`auth.users`，含密碼雜湊等 Supabase 自管資料）不在本輪備份範圍——若 Supabase 專案本身完全消失，光靠這份備份無法讓使用者用原密碼重新登入，需要 Supabase 自己的平台層備份或使用者重新註冊。這是「還原我方應用程式資料」與「還原整個 Supabase 專案狀態」兩種不同層級目標的取捨，本輪僅承諾前者。
- **不用 `googleapis` 套件**：見 A155，手動 JWT + REST，不新增依賴。
- **不做跨區備援**（如同步到第二個雲端供應商）：單一 Google Drive 目的地，符合 MVP 精神，未來若有需要再評估。
- **不驗證 Storage 備份的還原**：本輪還原驗證僅涵蓋資料庫（AC-2）。Storage 備份的「還原」本質上是解壓縮＋重新上傳物件，技術風險遠低於資料庫 SQL 還原（不涉及 schema／關聯完整性），故本輪不另外自動化驗證，僅確認 ZIP 內容正確生成（AC-3／AC-4）。

## 9. 假設登記（待 PO 追認）

- **A152（新增，範圍界定）**：`pg_dump` 僅備份 `public` schema（`--schema=public`），不含 Supabase 平台內部 schema／角色／擴充套件定義。**理由**：本專案 24 張表皆位於 `public` schema（Drizzle 慣例，未曾指定其他 schema）；Supabase 內部 schema 屬平台自身管理範疇，即使備份下來也無法有意義地還原到另一個全新 Supabase 專案（角色名稱、擴充套件版本等環境相依）。範圍收斂後備份內容單純、還原驗證（AC-2）才可行。
- **A153（新增，連線需求）**：DB 備份需要**獨立於 app runtime 的 Session pooler 連線字串**（新 secret `SUPABASE_DB_URL_BACKUP`），不可沿用既有 `DATABASE_URL`（Transaction pooler）。**理由**：Supabase 官方文件明確列出 Transaction pooler 模式不相容 `pg_dump`／`pg_restore`（pgbouncer transaction 模式不保留 session 狀態，`pg_dump` 需要的多輪查詢／游標行為會被打斷）；這是本輪撰寫 DOR 時就先發現、主動詢問 PO 取得正確連線字串，而非等實作時撞牆才發現。
- **A154（新增，實作方式）**：Storage 備份直接用 `@supabase/supabase-js`（`SUPABASE_URL`＋`SUPABASE_SERVICE_ROLE_KEY`）在獨立腳本內呼叫，不透過 app 的 `StorageAdapter` 介面。**理由**：比照既有 `scripts/setup-storage.ts` 的既定慣例——`scripts/` 底下的一次性／CI 維運腳本本來就是直接呼叫 Supabase client，憲法 §1「外部服務走 Adapter」規範的是 app 執行期領域邏輯（API 路由／Worker），不含這類獨立維運腳本；且備份需要「列出所有 bucket 所有物件」的能力，`StorageAdapter` 介面本身沒有 list 方法（只有 put/get/getSignedUrl/delete），為此擴充介面反而是不必要的耦合。
- **A155（新增，依賴管理）**：Google Drive 上傳採手動 JWT（RS256，Node 內建 `crypto`）＋REST 呼叫（`fetch`），不新增 `googleapis` npm 套件依賴。**理由**：比照 KB-022／KB-033 一貫的最小成本解法原則；Node 22 內建 `crypto.sign()` 與全域 `fetch` 已完全足夠處理 service account JWT 簽發與 Drive API 呼叫，`googleapis` 是體積龐大的完整 SDK，僅為了「建資料夾＋上傳＋清舊檔」三個簡單呼叫引入不合比例。
- **A156（新增，驗證強化，超出使用者原始要求）**：資料庫還原驗證做成**每次執行都自動驗證**，而非僅本輪驗收測一次。**理由**：PO 原始要求是「至少實測一次還原」，但 GitHub Actions 原生支援一次性 `postgres` service container，成本極低（每次執行約多花 1-2 分鐘、零額外費用），若只在本輪測一次，之後每天產生的備份其實都只是「假設格式沒變、應該還能還原」，不是真的驗證過；做成每次執行都驗證，才能長期兌現「沒測過還原的備份不算數」這個原則，而不只是通過本輪驗收的當下。還原用 `psql -v ON_ERROR_STOP=1`（任何 SQL 錯誤立即中止並回傳失敗），並比對還原後資料表清單與本專案已知 24 張表是否一致，兩項皆通過才算驗證成功。
- **A157（新增，實作細節）**：保留天數判斷依**檔名內嵌日期**（`db-backup-YYYY-MM-DD.sql` 的日期部分），非雲端物件的 `createdTime`／`LastModified`。**理由**：若未來因故補跑或重跑某一天的備份，物件層級的時間戳會是「實際執行時間」而非「備份對應的資料日期」，用檔名日期判斷更貼合「保留最近 14 個資料日」的原始意圖，避免補跑時把舊資料日的備份誤判為新鮮。
- **A158（新增，正式站驗收後修正，KB-042）**：上傳目的地由 Google Drive 改為 Cloudflare R2。**理由**：A155 原設計（service account JWT 上傳個人 Gmail Drive 共用資料夾）在正式站部署驗收時遭 Google 平台擋下（`HTTP 403 storageQuotaExceeded`——service account 對個人帳號 Drive 沒有儲存配額，官方僅提供 Shared Drives／OAuth domain-wide delegation 兩條路，皆為 Google Workspace 專屬功能），架構上走不通，非程式碼可修正的缺陷。PO 決定改用 Cloudflare R2（S3 相容物件儲存），PO 自建 bucket 與 API Token。
- **A159（新增，依賴管理，取代 A155 的套件選型部分）**：R2 上傳改用官方 `@aws-sdk/client-s3` 套件，而非延續 A155「不新增套件、手刻 REST 呼叫」的最小依賴路線。**理由**：R2／S3 走 AWS SigV4 簽章協定，手刻簽章邏輯（canonical request 建構、簽名鏈推導）遠比 Google Drive 當初的 JWT RS256 簽發複雜、更容易有難以察覺的邊界錯誤（URI 編碼規則、header 正規化順序等）；在「最小依賴」與「用對正確且經過大量實戰驗證的官方工具、降低出錯風險」的取捨上，這裡選擇後者。A155 對 Google Drive／JWT 部分的判斷本身沒有錯，僅因整個上傳目的地被 A158 取代而失去適用對象。

## 10. 三層結構回溯

- Feature：**E8-F1**（新增 Epic E8：維運與備份自動化，1/1，MVP 上線後追加，非原始 WBS 範圍）
- 對應：KNOWN_ISSUES.md「已解決」區（原第 2 項「Supabase 免費方案無自動備份／PITR」，Sprint 24／KB-035，本輪已解決）
- 前置依賴：備份帳號層級設定（Supabase Session pooler 連線字串＋Cloudflare R2 bucket／API Token，皆由 PO 提供）
