import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { deleteDocument, getStorageAdapter, updateDocument } from "@/modules/documents";

type Context = { params: Promise<{ id: string; documentId: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  VERSION_CONFLICT: "這筆資料已在其他位置更新，請重新整理後再試一次。",
};

/** PATCH /api/projects/{id}/documents/{documentId}（E3-F2／A47：僅開放編輯 reportDate） */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { version?: number; reportDate?: string | null };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!Number.isInteger(body.version)) {
    return apiError("INVALID_REQUEST", "缺少有效的 version", 400, requestId);
  }
  if (body.reportDate !== null && typeof body.reportDate !== "string") {
    return apiError("INVALID_REQUEST", "reportDate 格式錯誤", 400, requestId);
  }

  const { id, documentId } = await context.params;
  const result = await updateDocument(auth.userId, id, documentId, {
    version: body.version!,
    reportDate: body.reportDate ?? null,
  });
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "PATCH",
      });
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    const status = result.code === "VERSION_CONFLICT" ? 409 : 400;
    return apiError(result.code, ERROR_MESSAGES[result.code] ?? "更新失敗", status, requestId);
  }

  return attachSlidingCookie(apiOk({ document: result.document }, requestId), auth);
});

/** DELETE /api/projects/{id}/documents/{documentId}（AC-9：取消或刪除皆軟刪除） */
export const DELETE = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, documentId } = await context.params;
  const result = await deleteDocument(getStorageAdapter(), auth.userId, id, documentId);
  if (!result.ok) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "DELETE",
    });
    return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
  }

  return attachSlidingCookie(apiOk({ document: result.document }, requestId), auth);
});
