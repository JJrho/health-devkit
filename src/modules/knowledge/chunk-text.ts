/**
 * E4-F1：把長文字依段落切分成較小的 chunk，供全文檢索與未來的檢索增強
 * 問答（RAG）使用。純函式，不接觸資料庫。
 */
export function chunkText(fullText: string, maxChunkLength = 800): string[] {
  const paragraphs = fullText
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter((paragraph) => paragraph.length > 0);

  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= maxChunkLength) {
      chunks.push(paragraph);
      continue;
    }
    // 過長段落依固定長度再切分，避免單一 chunk 過大影響檢索精準度
    for (let i = 0; i < paragraph.length; i += maxChunkLength) {
      chunks.push(paragraph.slice(i, i + maxChunkLength));
    }
  }
  return chunks;
}
