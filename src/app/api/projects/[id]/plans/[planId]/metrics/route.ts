import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { addMetric } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string }> };

/** POST .../plans/{planId}/metrics（category 須為 leading／outcome／safety，A92） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { category?: string; name?: string; description?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.category || !body.name) {
    return apiError("INVALID_REQUEST", "請提供指標分類與名稱", 400, requestId);
  }

  const { id, planId } = await context.params;
  const result = await addMetric(auth.userId, id, planId, body.category, body.name, body.description);
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
      return apiError("INVALID_REQUEST", "指標分類須為 leading／outcome／safety", 400, requestId);
    }
    return apiError("NOT_FOUND", "找不到這個行動計畫。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ metricId: result.id }, requestId), auth);
});
