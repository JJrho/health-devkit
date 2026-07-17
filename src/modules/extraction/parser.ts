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
// 允許「單邊比較（如 <200）」或「完整雙邊區間（如 4.0-10.0）」，
// 但不接受裸數字（避免與 VALUE_TOKEN 混淆、也避免黏合殘留物誤判為區間）
const RANGE_TOKEN = /^(?:[<>]\d+(?:\.\d+)?|\d+(?:\.\d+)?\s*[-~]\s*\d+(?:\.\d+)?)$/;

/**
 * Sprint 8（PoC 2/2）根因修正：pdfjs 對間距 <1.5pt 的相鄰文字會合併成單一字串且
 * 不留分隔字元（如 "142"＋"90-135" → "14290-135"），欄位邊界資訊在到達本函式前已
 * 遺失，無法用任何字串規則安全還原原始切法。
 * 舊版邏輯的漏洞：這類無法辨識的黏合殘留字串會被 fallback 分支直接塞進
 * rawUnit／rawReferenceRange（不驗證內容形狀），使黏合垃圾也算入 matchedParts、
 * 推高信心值——等同「自信地錯」，比「誠實地不完整」更危險（憲法 §3 醫療安全）。
 * 本函式修正為：僅在內容通過形狀驗證時才指派 rawUnit／rawReferenceRange，
 * 否則維持 null（前端顯示「無法辨識」，交由使用者於 E2-F3 自行輸入，PO 拍板之
 * first priority），不嘗試猜測切法。
 */
function looksLikeUnrecognizedGlue(token: string): boolean {
  // 含數字又含 -/~ 但不是乾淨的 RANGE_TOKEN：極可能是間距過近被 pdfjs 黏合的殘留物
  return /\d/.test(token) && /[-~]/.test(token) && !RANGE_TOKEN.test(token);
}

// A28：頁首／病患中繼資料列常見「欄位名 : 值」型態（如「列印序號 : 50065」），
// 檢驗項目名稱本身不會含冒號——即使根因修正（looksLikeUnrecognizedGlue）已讓大多數
// 黏合污染消失，若中繼資料列恰好在同一 y 列帶到其他欄位乾淨的數字，仍可能湊出
// 高信心的假陽性。冒號是本輪實測中唯一能穩定區分「這是中繼資料，不是檢驗列」的
// 訊號，故直接排除，不當作候選列（而非降低信心值——這類列本質上就不是檢驗數據）。
const METADATA_LINE = /[:：]/;

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
  if (METADATA_LINE.test(rawTestName)) return null; // A28：頁首／病患中繼資料列，非檢驗數據

  const rawValue = tokens[valueIndex]!;
  const rest = tokens.slice(valueIndex + 1);

  let rawUnit: string | null = null;
  let rawReferenceRange: string | null = null;

  if (rest.length > 0) {
    if (RANGE_TOKEN.test(rest[0]!)) {
      // 第一個殘留 token 本身就是乾淨的參考區間（無單位的情況）
      rawReferenceRange = rest[0]!;
    } else if (!looksLikeUnrecognizedGlue(rest[0]!)) {
      rawUnit = rest[0]!;
      const remainder = rest.slice(1);
      if (remainder.length > 0 && RANGE_TOKEN.test(remainder[0]!)) {
        rawReferenceRange = remainder[0]!;
      } else if (remainder.length > 0 && RANGE_TOKEN.test(remainder.join(""))) {
        // 參考區間因原始 PDF 內有空白被切成多個 token（如 "70" "-100"），
        // 合併後仍需再次驗證形狀，通過才採用
        rawReferenceRange = remainder.join("");
      }
      // 其餘殘留字串無法驗證為乾淨的參考區間，維持 null（不猜測切法）
    }
    // rest[0] 判定為無法辨識的黏合殘留物：rawUnit／rawReferenceRange 皆維持 null
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
