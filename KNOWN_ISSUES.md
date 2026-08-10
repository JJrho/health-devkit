# 已知限制 Known Issues

> E6-F2（A147）彙整版：只列**目前仍開放（未解決）**的已知限制，供 PO 與未來維護者快速掌握現況，
> 不需翻閱整本 09_KNOWLEDGE_BASE.md（該檔含大量已解決的歷史事故記錄）。
> 每項附對應 KB 編號可查完整脈絡。最後更新：2026-08-10。

## 上線前必須處理（硬門檻）

1. **台灣個資與醫療服務法律審查未完成**——12_RELEASE_CHECKLIST.md 與上游規格 §27.3 明列的上線硬門檻，需要人類法律專業判斷，非本專案 AI Agent 可完成或代為判斷的工作範圍（Sprint 24 A146）。待審查文件：隱私權政策草稿、資料處理流程說明、既有安全措施清單（本文件＋09_KNOWLEDGE_BASE.md）。

## 已知安全與資料限制

2. **RLS 政策未實際生效**（KB-018）：`projects` 表已建立 RLS 政策，但連線角色 `postgres` 具 `rolbypassrls=true`，政策對本專案自身連線不生效；真正防線是應用層四層權限鏈（已在每個 Feature 反覆驗證，Sprint 24 P0 e2e 亦重新確認 6 條跨帳號存取路徑一律 403）。修法需另建專用角色＋雙 service 環境變數同步更新，待 PO 決定處理時機。

3. **未驗證帳號無法登入，與 C6 規格牴觸**（KB-020）：全新註冊、未點驗證信的帳號走真實 Supabase 登入會回 `email_not_confirmed`。PO 已於 2026-07-15 決定本輪不修，記錄為已知限制；修法需先確認 Supabase 關閉「Confirm email」設定後 `email_confirmed_at` 的實際行為（見 KB-020 完整路線圖）。

4. **健檢文件覆蓋率天花板約 14%**（KB-023）：真實樣本 PoC 顯示 86% 的健檢報告為純掃描圖檔（無文字層），目前文字型解析管線無法處理，需等 OCR 上線（05_BACKLOG 已拍板維持原排程，非本次上線範圍）。

5. **E4-F3 安全把關為顯示層級，非自動攔截**（A81）：對話中偵測到的可疑內容（如要求停藥、要求顯示內部規則等 Abuse Case）僅顯示提示，系統不自動封鎖對話或阻止 AI 回覆。語意層面「引用內容與 claim 是否一致」的深度核對（技術選型 §11.5）亦非本輪範圍，需額外 NLI 模型或二次 LLM 呼叫。

6. **原始上傳檔案未去識別化**（KB-039，Sprint 26）：結構化資料表（`users`／`extracted_items`／`observations`）皆無姓名、身分證、生日、地址、電話欄位；但使用者上傳的原始掃描檔／照片本身完整保存於 Storage，若原始報告印有姓名等資訊，會原封不動存在。E2-F5（Sprint 26）已補上使用者可自主刪除原始檔的引導提示（非自動去識別化或強制刪除）。**2026-08-08（KB-045）**：`/privacy` 公開頁面文案原本落後於 E2-F5 功能一個 Sprint，未告訴使用者這件事，已補上對外誠實揭露（原始檔會保留、不會自動去識別化、可自行刪除）——此舉關閉的是「公開頁面文案落後於已知限制」的落差，**限制本身（原始檔預設仍保留且未去識別化）並未改變**，提交法律審查（見上方第 1 項）時仍需一併說明。

7. **E2-F5 刪除引導提示尚未完整端到端驗證**（Sprint 26）：`DeletionGuidanceNotice` 元件本身已用單元測試驗證文案與點擊行為，但「真實帳號→上傳→Worker 解析→人工確認→於文件列表親眼看到提示」這條完整路徑本輪未實際走過一次（本機 `pnpm dev` 未同時啟動 Worker，PO 已同意暫不補）。**PO 已指示：下次有真實使用者走過上傳流程時，順手確認一次並記錄結果**，確認後可將本項移除並補記於 09_KNOWLEDGE_BASE.md。

## 已知體感／非阻塞限制

8. **Google 登入同意畫面顯示 Supabase 專案網域，非自訂應用程式名稱**：需 PO 於 Google Cloud Console 另行設定 OAuth 同意畫面的應用程式名稱，純品牌體感問題，不影響功能。

9. **惡意檔案掃描（VirusTotal）需要 PO 自行申請 API Key 並設定 `VIRUSTOTAL_API_KEY`**（Sprint 24，E6-F2，KB-021 缺口本輪已補上）：免費額度上限請參考 VirusTotal 官方文件，若流量超出免費額度需評估升級方案；掃描服務逾時或無金鑰時，上傳一律 fail closed 直接拒絕（見 `src/modules/documents/service.ts` `completeUpload()`），不會靜默放行未掃描檔案。

10. **備份機制依賴 Supabase Legacy API Keys（service_role/anon，eyJ 格式 JWT）**（Sprint 27，KB-043）：Supabase 後台已提示新版 Publishable/Secret Key 系統，並提供「Disable JWT-based API keys」選項，代表舊版金鑰未來可能被停用。目前 E8-F1 備份腳本、及既有 `SupabaseAuthAdapter`／`SupabaseStorageAdapter` 皆仍使用 Legacy 格式。待 Supabase 官方明確棄用時程或本專案有餘裕時，需評估將全站（含備份腳本、既有 adapter）改用新版 Secret Key 格式，避免屆時金鑰失效造成正式站與備份同時中斷。此項非急迫，列入觀察，非本輪處理範圍。

## 已解決／已拍板不處理（僅供對照，詳見 09_KNOWLEDGE_BASE.md）

- **Supabase 免費方案無自動備份、無 PITR**（Sprint 24 查證，KB-035）：**Sprint 27（E8-F1）已解決**——新增每日自動備份（資料庫 public schema＋Storage 全量）上傳 Cloudflare R2，保留 14 天，且每次執行皆自動驗證備份真的可還原（非僅假設格式正確），詳見 KB-041／KB-042、07_SPRINT_LOG。平台層級仍無 PITR，但應用層級的每日備份＋已驗證還原路徑已補上此缺口。
- KB-021 惡意檔案掃描缺口：**Sprint 24 本輪已解決**（VirusTotal API）。
- KB-037 Hero 頁 `og:image` 缺口：**Sprint 26 已解決**（PO 提供 `public/og-image.jpg`，1200x630）。
- KB-009／KB-012／KB-025／KB-026／KB-028／KB-029／KB-031／KB-032／KB-040：實作期間發現並修正的技術缺陷，皆已解決，僅作為「未來避免」教訓保留在 KB。
