import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { createEscalationSummary } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string }> };

/** POST .../plans/{planId}/escalation-summary（A119：僅計畫已有需要專業評估的檢討時可產生） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, planId } = await context.params;
  const result = await createEscalationSummary(auth.userId, id, planId);
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
      return apiError("INVALID_REQUEST", "尚未有「需要專業評估」的檢討紀錄，無法產生轉介摘要", 409, requestId);
    }
    return apiError("NOT_FOUND", "找不到這個行動計畫。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ summaryId: result.id }, requestId), auth);
});
