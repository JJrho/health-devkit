import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { listObservations } from "@/modules/observations";

type Context = { params: Promise<{ id: string }> };

/** GET /api/projects/{id}/observations（E2-F4；唯讀，僅 active；四層鏈：findOwnedProject） */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await listObservations(auth.userId, id);
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

  return attachSlidingCookie(apiOk({ items: result.items }, requestId), auth);
});
