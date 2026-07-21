import { getDb } from "@/db/client";
import { auditEvents } from "@/db/schema";
import { logger } from "@/lib/logger";

/**
 * E6-F1 稽核事件寫入（SDD §4.12）：取代 A11 過渡期僅 logger.warn 的作法，
 * 落地成正式可查詢紀錄。userId 不設外鍵（A138），metadata 僅容白名單結構化欄位，
 * 憲法 §4：健康內容與金鑰永不寫入。
 */
export type AuditEventType =
  | "project_access_denied"
  | "account_deletion_requested"
  | "account_deletion_cancelled"
  | "account_deletion_completed";

export type AuditMetadata = Partial<{
  requestId: string;
  projectId: string;
  path: string;
  method: string;
}>;

export async function recordAuditEvent(
  userId: string,
  eventType: AuditEventType,
  metadata: AuditMetadata = {},
): Promise<void> {
  await getDb().insert(auditEvents).values({ userId, eventType, metadata });
}

/**
 * 供既有同步呼叫端使用的 fire-and-forget 包裝：稽核落地失敗不得讓
 * 原始請求（例如存取遭拒的 404 回應）跟著失敗，只記錯誤類別名。
 */
export function recordAuditEventAsync(
  userId: string,
  eventType: AuditEventType,
  metadata: AuditMetadata = {},
): void {
  void recordAuditEvent(userId, eventType, metadata).catch((error: unknown) => {
    logger.error("稽核事件寫入失敗", {
      requestId: metadata.requestId,
      errorName: error instanceof Error ? error.constructor.name : "UnknownError",
    });
  });
}
