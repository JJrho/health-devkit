import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied, findOwnedProject } from "@/modules/projects";
import { cancelMessage } from "@/modules/conversations";

type Context = { params: Promise<{ id: string; messageId: string }> };

/** POST /api/projects/{id}/messages/{messageId}/cancel（E4-F3 PoC 1/2；上游「取消後停止模型工作」） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, messageId } = await context.params;
  const project = await findOwnedProject(auth.userId, id);
  if (!project) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "POST",
    });
    return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
  }

  const cancelled = cancelMessage(messageId);
  return attachSlidingCookie(apiOk({ cancelled }, requestId), auth);
});
