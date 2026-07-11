# 技術規格 — 個人健康檢查管理平台

> 完整選型評估以 archive/ 內「技術選型 v1_0_0」為準；本檔為決策摘要＋待裁決事項。

## 1. 已定案決策（上游 §23 決策紀錄）
Next.js + TS／模組化單體 + Worker／PostgreSQL（+pgvector）／Supabase Auth／S3 相容私有儲存／Queue 可替換／ECharts／PDF.js 預覽／OCR Adapter／FTS+pgvector 混合檢索／LLM Provider Adapter（第一版 OpenAI Responses API）／SSE／Vitest+TL+Playwright／受管平台 Web-Worker 分離。

## 2. 明確不採用（上游 §21）
單一 HTML 正式架構、純前端保存健康資料、Firestore 核心庫、獨立向量庫、微服務、AI 自動診斷/開方/預測、命理輸入健康規則。

## 3. Clarify 定案（2026-07-11）
C1：單一 app 簡化模組化單體起步，保留 Adapter，packages 拆分延後。C2：PostgreSQL queue 起步（Queue Adapter 保留 Redis 升級路徑）。C4：第一版僅文字型 PDF，掃描 OCR feature flag 延後。C5：Supabase 東京區；Web/Worker 受管平台由 PO 擇一後補記於此。

## 4. 重新評估觸發條件
採上游 §24 十二條。
