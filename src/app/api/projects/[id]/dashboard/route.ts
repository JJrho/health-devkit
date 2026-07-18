import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { getDashboard } from "@/modules/dashboard";

type Context = { params: Promise<{ id: string }> };

/** GET /api/projects/{id}/dashboard（E3-F1；區塊 1「目前健康狀態」＋區塊 3「早期變化」聚合） */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await getDashboard(auth.userId, id);
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
    apiOk({ currentStatus: result.currentStatus, earlyChanges: result.earlyChanges }, requestId),
    auth,
  );
});
