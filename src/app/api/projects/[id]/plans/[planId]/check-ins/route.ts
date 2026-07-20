import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { createCheckIn } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string }> };

/** POST .../plans/{planId}/check-ins（A109：僅 active／paused 計畫可新增） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { metricId?: string; value?: string; note?: string; checkinDate?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.metricId || !body.value || !body.checkinDate) {
    return apiError("INVALID_REQUEST", "請提供指標、數值與回報日期", 400, requestId);
  }

  const { id, planId } = await context.params;
  const result = await createCheckIn(auth.userId, id, planId, {
    metricId: body.metricId,
    value: body.value,
    note: body.note,
    checkinDate: new Date(body.checkinDate),
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
      return apiError("INVALID_REQUEST", "只有執行中或已暫停的計畫可以記錄日常回報", 409, requestId);
    }
    return apiError("NOT_FOUND", "找不到這個指標。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ checkInId: result.id }, requestId), auth);
});
