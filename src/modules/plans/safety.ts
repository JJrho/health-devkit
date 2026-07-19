import type { PlanRow } from "./access";

export type MetricCategory = "leading" | "outcome" | "safety";
export const METRIC_CATEGORIES: readonly MetricCategory[] = ["leading", "outcome", "safety"];

export interface SafetyCheckResult {
  ok: boolean;
  missingFields: string[];
}

/**
 * A87：結構化安全審查——僅檢查計畫自身欄位與指標分類是否齊全，
 * 不對 health_profiles 內容做語意判讀。缺漏欄位以固定代稱回傳供 API 組裝訊息。
 */
export function checkPlanSafetyInfo(plan: PlanRow, metricCategories: string[]): SafetyCheckResult {
  const missing: string[] = [];
  if (!plan.baseline) missing.push("baseline");
  if (!plan.riskNote) missing.push("riskNote");
  if (!plan.stopCondition) missing.push("stopCondition");
  if (!plan.referralCondition) missing.push("referralCondition");
  if (!plan.reviewDate) missing.push("reviewDate");

  const present = new Set(metricCategories);
  for (const category of METRIC_CATEGORIES) {
    if (!present.has(category)) missing.push(`metric:${category}`);
  }

  return { ok: missing.length === 0, missingFields: missing };
}
