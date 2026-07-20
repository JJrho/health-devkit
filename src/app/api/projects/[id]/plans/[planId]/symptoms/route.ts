import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { createSymptomEvent } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string }> };

/**
 * POST .../plans/{planId}/symptoms（A109：僅 active／paused 計畫可新增）。
 * isAdverseEvent=true 時服務層會自動呼叫 stopPlan（A105 不良反應暫停鏈）。
 */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { description?: string; occurredAt?: string; isAdverseEvent?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.description || !body.occurredAt) {
    return apiError("INVALID_REQUEST", "請提供症狀描述與發生時間", 400, requestId);
  }

  const { id, planId } = await context.params;
  const result = await createSymptomEvent(auth.userId, id, planId, {
    description: body.description,
    occurredAt: new Date(body.occurredAt),
    isAdverseEvent: body.isAdverseEvent,
  });
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
      return apiError("INVALID_REQUEST", "只有執行中或已暫停的計畫可以回報症狀事件", 409, requestId);
    }
    return apiError("NOT_FOUND", "找不到這個行動計畫。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ symptomEventId: result.id }, requestId), auth);
});
