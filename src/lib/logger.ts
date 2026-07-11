/**
 * 結構化日誌（Sprint 1 最小版；Sprint 2 收斂為完整 redaction 基線）。
 * 憲法 §4：健康內容、完整 prompt、AI 回答、signed URL、token 一律不得入日誌。
 * 因此本 logger 的介面「不接受任意物件」——只接受白名單欄位，從結構上杜絕誤傳 payload。
 */

type SafeFields = {
  jobId?: string;
  jobType?: string;
  status?: string;
  retryCount?: number;
  durationMs?: number;
  errorName?: string; // 只記錯誤類別名，不記完整訊息內容
};

function emit(level: "info" | "warn" | "error", message: string, fields?: SafeFields) {
  const entry = {
    level,
    time: new Date().toISOString(),
    message,
    ...fields,
  };
   
  console[level === "info" ? "log" : level](JSON.stringify(entry));
}

export const logger = {
  info: (message: string, fields?: SafeFields) => emit("info", message, fields),
  warn: (message: string, fields?: SafeFields) => emit("warn", message, fields),
  error: (message: string, fields?: SafeFields) => emit("error", message, fields),
};
