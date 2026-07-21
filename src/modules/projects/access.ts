import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { projects } from "@/db/schema";
import { logger } from "@/lib/logger";
import { recordAuditEventAsync } from "@/modules/audit";

export type ProjectRow = typeof projects.$inferSelect;

/**
 * 四層權限鏈第 2～4 層（SDD §7）：專案擁有權 → 資源屬於專案（本模組資源即專案本身，
 * 與擁有權同層一併驗證）→ 未刪除。第 1 層「登入」由呼叫端 API route 驗證 session 後才呼叫本函式。
 * 找不到／非本人擁有／已刪除一律回傳 null，不區分理由——避免讓錯誤訊息洩漏他人專案是否存在
 * （比照 auth 模組防列舉手法）。
 */
export async function findOwnedProject(
  userId: string,
  projectId: string,
): Promise<ProjectRow | null> {
  const rows = await getDb()
    .select()
    .from(projects)
    .where(
      and(eq(projects.id, projectId), eq(projects.ownerId, userId), isNull(projects.deletedAt)),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * AC-6（TDD P0 種子）：跨帳號存取一律記錄。以 logger.warn 記結構化識別碼欄位
 * （皆非健康內容）供即時可觀測性，並同步寫入正式 audit_events 表（E6-F1，
 * 取代 A11 過渡期單純 logger 的作法）；稽核落地為 fire-and-forget，寫入失敗
 * 不影響原始存取遭拒回應。
 */
export function auditAccessDenied(fields: {
  requestId: string;
  userId: string;
  projectId: string;
  path: string;
  method: string;
}): void {
  logger.warn("跨帳號專案存取遭拒", {
    requestId: fields.requestId,
    userId: fields.userId,
    projectId: fields.projectId,
    path: fields.path,
    method: fields.method,
    status: "PROJECT_ACCESS_DENIED",
  });
  recordAuditEventAsync(fields.userId, "project_access_denied", {
    requestId: fields.requestId,
    projectId: fields.projectId,
    path: fields.path,
    method: fields.method,
  });
}
