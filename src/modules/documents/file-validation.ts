import { PDFDocument } from "pdf-lib";

/** C13：格式白名單（PDF／JPG／PNG），以實際內容 magic bytes 判斷，不信副檔名 */
export type DetectedFileType = "application/pdf" | "image/jpeg" | "image/png";

export function detectFileType(buffer: Buffer): DetectedFileType | null {
  if (buffer.length >= 4 && buffer.subarray(0, 4).toString("ascii") === "%PDF") {
    return "application/pdf";
  }
  if (buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return "image/jpeg";
  }
  if (
    buffer.length >= 8 &&
    buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  ) {
    return "image/png";
  }
  return null;
}

/** C12：單 PDF ≤30 頁。非 PDF 檔案回 null（無頁數概念） */
export async function countPdfPages(buffer: Buffer): Promise<number | null> {
  try {
    const doc = await PDFDocument.load(buffer, { updateMetadata: false });
    return doc.getPageCount();
  } catch {
    return null; // 無法解析視同損毀，由呼叫端回 FILE_CORRUPTED
  }
}
