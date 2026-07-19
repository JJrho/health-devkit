import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { regenerateMessage } from "@/modules/conversations";

type Context = { params: Promise<{ id: string; messageId: string }> };

/**
 * POST /api/projects/{id}/messages/{messageId}/regenerate（E4-F3 PoC 2/2，A78）。
 * 建立新版本訊息（status=queued），前端接著呼叫 GET .../stream 觸發實際生成
 * （同 sendMessage 的兩段式設計）。
 */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, messageId } = await context.params;
  const result = await regenerateMessage(auth.userId, id, messageId);
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
    return apiError("NOT_FOUND", "找不到這則訊息", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ messageId: result.messageId }, requestId), auth);
});
