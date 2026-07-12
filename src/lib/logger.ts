/**
 * 結構化日誌＋redaction 基線（Sprint 2 AC-5）。
 * 憲法 §4：健康內容、完整 prompt、AI 回答、signed URL、token 一律不得入日誌。
 *
 * 兩道防線：
 * 1. 型別層：介面只接受 SafeFields 白名單欄位。
 * 2. 執行期：任何繞過型別（JS 呼叫、as any）傳入的非白名單欄位，
 *    一律剔除並以 redactedFieldCount 標記，值永不輸出。
 */

const SAFE_FIELD_WHITELIST = [
  "requestId",
  "jobId",
  "jobType",
  "status",
  "retryCount",
  "durationMs",
  "errorName",
  "path",
  "method",
  "httpStatus",
] as const;

export type SafeFields = Partial<{
  requestId: string;
  jobId: string;
  jobType: string;
  status: string;
  retryCount: number;
  durationMs: number;
  /** 只記錯誤類別名，不記完整訊息內容 */
  errorName: string;
  path: string;
  method: string;
  httpStatus: number;
}>;

function redact(fields: Record<string, unknown>): Record<string, unknown> {
  const safe: Record<string, unknown> = {};
  let redactedFieldCount = 0;
  for (const [key, value] of Object.entries(fields)) {
    if ((SAFE_FIELD_WHITELIST as readonly string[]).includes(key)) {
      safe[key] = value;
    } else {
      redactedFieldCount += 1; // 只計數，鍵與值皆不輸出
    }
  }
  if (redactedFieldCount > 0) safe.redactedFieldCount = redactedFieldCount;
  return safe;
}

function emit(level: "info" | "warn" | "error", message: string, fields?: SafeFields) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...redact((fields ?? {}) as Record<string, unknown>),
  };
   
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

export const logger = {
  info: (message: string, fields?: SafeFields) => emit("info", message, fields),
  warn: (message: string, fields?: SafeFields) => emit("warn", message, fields),
  error: (message: string, fields?: SafeFields) => emit("error", message, fields),
};
