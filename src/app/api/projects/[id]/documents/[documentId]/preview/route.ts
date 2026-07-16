import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { getPreviewUrl, getStorageAdapter } from "@/modules/documents";

type Context = { params: Promise<{ id: string; documentId: string }> };

/** GET /api/projects/{id}/documents/{documentId}/preview（AC-10：短效 signed URL，不入日誌） */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, documentId } = await context.params;
  const result = await getPreviewUrl(getStorageAdapter(), auth.userId, id, documentId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "GET",
      });
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    return apiError("INVALID_REQUEST", "這份文件尚未完成上傳，無法預覽。", 400, requestId);
  }

  return attachSlidingCookie(apiOk({ url: result.url }, requestId), auth);
});
