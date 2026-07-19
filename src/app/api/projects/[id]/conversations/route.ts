import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { createConversation, listConversations } from "@/modules/conversations";

type Context = { params: Promise<{ id: string }> };

/** POST /api/projects/{id}/conversations（E4-F3 PoC 1/2；建立新對話） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await createConversation(auth.userId, id);
  if (!result.ok) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "POST",
    });
    return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
  }

  return attachSlidingCookie(apiOk({ conversationId: result.conversationId }, requestId), auth);
});

/** GET /api/projects/{id}/conversations（E4-F3 PoC 2/2；列表，依 updatedAt 遞減、不分頁，A83） */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await listConversations(auth.userId, id);
  if (!result.ok) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "GET",
    });
    return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
  }

  return attachSlidingCookie(
    apiOk({ conversations: result.conversations.map((c) => ({ id: c.id, updatedAt: c.updatedAt })) }, requestId),
    auth,
  );
});
