import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { activatePlan } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string }> };

/** POST .../plans/{planId}/activate（A87：結構化安全審查，見上游 §24 PLAN_SAFETY_INFO_REQUIRED） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, planId } = await context.params;
  const result = await activatePlan(auth.userId, id, planId);
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
    if (result.code === "PLAN_SAFETY_INFO_REQUIRED") {
      return apiError(
        "PLAN_SAFETY_INFO_REQUIRED",
        `尚未完成安全資訊，不能啟用計畫（缺漏：${result.missingFields.join("、")}）`,
        422,
        requestId,
      );
    }
    if (result.code === "INVALID_REQUEST") {
      return apiError("INVALID_REQUEST", "此計畫目前狀態無法啟用", 409, requestId);
    }
    return apiError("NOT_FOUND", "找不到這個行動計畫。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ plan: result.plan }, requestId), auth);
});
