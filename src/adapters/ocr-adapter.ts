/**
 * OcrAdapter 介面（憲法 §1）。
 * C4：第一版僅文字型 PDF（文字層抽取）；掃描 OCR 以 feature flag 延後。
 * Sprint 1 僅定義介面；文字層抽取實作於 E2-F2（解析管線）。
 */
export interface OcrAdapter {
  /** 抽取單頁文字與座標（頁面座標回查用，SDD §4.5） */
  extractPage(pdfBytes: Buffer, pageNumber: number): Promise<OcrPageResult>;
}

export interface OcrPageResult {
  pageNumber: number;
  blocks: Array<{
    text: string;
    /** jsonb 座標（憲法 §4 型別規則） */
    bbox: { x: number; y: number; width: number; height: number };
  }>;
}
