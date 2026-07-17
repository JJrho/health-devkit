/**
 * E2-F2 PoC 解析啟發式（SDD §4.5；C14）。
 * 非 ML／OCR 信心值——依「項目名稱／數值／單位／參考區間」四段是否清楚匹配計分（A23）。
 * 具體規則與權重屬本輪 PoC 設計細節，Sprint 8（若需要）可依實測調整。
 */

export interface TextItem {
  str: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Line {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ParsedFields {
  rawTestName: string;
  rawValue: string;
  rawUnit: string | null;
  rawReferenceRange: string | null;
  confidence: number;
}

export interface Candidate extends ParsedFields {
  coordinates: { x: number; y: number; width: number; height: number };
}

const Y_TOLERANCE = 3; // 同一列文字項目的 y 座標容許誤差（pdfjs 座標單位）

/** 依 y 座標分組成列，同列依 x 排序後拼成文字（供啟發式解析用） */
export function groupTextIntoLines(items: TextItem[]): Line[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const lines: TextItem[][] = [];

  for (const item of sorted) {
    const line = lines.find((group) => Math.abs(group[0]!.y - item.y) <= Y_TOLERANCE);
    if (line) line.push(item);
    else lines.push([item]);
  }

  return lines.map((group) => {
    const sortedGroup = [...group].sort((a, b) => a.x - b.x);
    const minX = Math.min(...sortedGroup.map((i) => i.x));
    const maxX = Math.max(...sortedGroup.map((i) => i.x + i.width));
    const maxHeight = Math.max(...sortedGroup.map((i) => i.height));
    return {
      text: sortedGroup.map((i) => i.str).join(" ").replace(/\s+/g, " ").trim(),
      x: minX,
      y: sortedGroup[0]!.y,
      width: maxX - minX,
      height: maxHeight,
    };
  });
}

const VALUE_TOKEN = /^[<>]?\d+(?:\.\d+)?$/;
const RANGE_TOKEN = /^[<>]?\d+(?:\.\d+)?(?:\s*[-~]\s*\d+(?:\.\d+)?)?$/;

/**
 * 單列啟發式：找第一個「像數值」的 token，前面是項目名稱、後面依序嘗試單位／參考區間。
 * 名稱與數值都找不到就不算候選列（回 null，代表這只是普通文字，不是檢驗數據列）。
 */
export function parseLabLine(text: string): ParsedFields | null {
  const tokens = text.split(/\s+/).filter(Boolean);
  const valueIndex = tokens.findIndex((token) => VALUE_TOKEN.test(token));
  if (valueIndex <= 0) return null; // 沒有數值，或數值在最前面（沒有名稱）

  const rawTestName = tokens.slice(0, valueIndex).join(" ").trim();
  if (!rawTestName) return null;

  const rawValue = tokens[valueIndex]!;
  const rest = tokens.slice(valueIndex + 1);

  let rawUnit: string | null = null;
  let rawReferenceRange: string | null = null;

  if (rest.length > 0 && !RANGE_TOKEN.test(rest[0]!)) {
    rawUnit = rest[0]!;
    if (rest.length > 1 && RANGE_TOKEN.test(rest.slice(1).join(""))) {
      rawReferenceRange = rest.slice(1).join("");
    } else if (rest.length > 1) {
      rawReferenceRange = rest.slice(1).join(" ");
    }
  } else if (rest.length > 0) {
    rawReferenceRange = rest.join("");
  }

  const matchedParts = [rawTestName, rawValue, rawUnit, rawReferenceRange].filter(
    (part) => part !== null && part !== "",
  ).length;
  const confidence = matchedParts >= 4 ? 0.95 : matchedParts === 3 ? 0.7 : 0.45;

  return { rawTestName, rawValue, rawUnit, rawReferenceRange, confidence };
}

/** 整份文件的候選抽取（跨頁）；由呼叫端提供已按頁分組的文字項目 */
export function extractCandidatesFromPage(items: TextItem[]): Array<
  Candidate & { line: Line }
> {
  const lines = groupTextIntoLines(items);
  const candidates: Array<Candidate & { line: Line }> = [];
  for (const line of lines) {
    const candidate = parseLabLine(line.text);
    if (candidate) {
      candidates.push({
        ...candidate,
        coordinates: { x: line.x, y: line.y, width: line.width, height: line.height },
        line,
      });
    }
  }
  return candidates;
}
