import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { resumePlan } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string }> };

/** POST .../plans/{planId}/resume（paused→active） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, planId } = await context.params;
  const result = await resumePlan(auth.userId, id, planId);
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
    if (result.code === "INVALID_REQUEST") {
      return apiError("INVALID_REQUEST", "只有暫停中的計畫可以恢復", 409, requestId);
    }
    if (result.code === "PLAN_ADVERSE_EVENT") {
      return apiError("PLAN_ADVERSE_EVENT", "已暫停相關行動，請先處理不舒服事件", 409, requestId);
    }
    return apiError("NOT_FOUND", "找不到這個行動計畫。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "active" }, requestId), auth);
});
