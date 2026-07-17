import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { getQueueAdapter } from "@/modules/documents";
import { reprocessDocument } from "@/modules/extraction";

type Context = { params: Promise<{ id: string; documentId: string }> };

/** POST /api/projects/{id}/documents/{documentId}/reprocess（AC-7：清空重排） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, documentId } = await context.params;
  const result = await reprocessDocument(getQueueAdapter(), auth.userId, id, documentId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "POST",
      });
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    return apiError("INVALID_REQUEST", "這份文件尚未完成上傳，無法重新解析。", 400, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "processing" }, requestId), auth);
});
