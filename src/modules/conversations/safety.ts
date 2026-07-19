import type { RetrievalContext } from "./retrieval";

/** A73：檢索結果皆空時直接視為資料不足，不呼叫 LLM（節省成本＋不編造）。 */
export function isContextInsufficient(context: RetrievalContext): boolean {
  return context.observations.length === 0 && context.knowledgeChunks.length === 0;
}

/**
 * A76：診斷式語言警示掃描——關鍵字比對作為明確、有限的把關手段，非嚴謹語言學
 * 分析。命中僅供人工檢閱／記錄警示，不在 PoC 階段自動攔截回答（避免誤判擋下
 * 合法回答造成使用者無法取得任何資訊；正式產品化前應另評估攔截策略）。
 */
const DIAGNOSTIC_LANGUAGE_PATTERNS = [/你(已經)?得了/, /確診/, /診斷為/, /可以停藥/, /建議劑量/, /每次吃.{0,4}(顆|毫克|mg)/];

export function scanForDiagnosticLanguage(content: string): boolean {
  return DIAGNOSTIC_LANGUAGE_PATTERNS.some((pattern) => pattern.test(content));
}
