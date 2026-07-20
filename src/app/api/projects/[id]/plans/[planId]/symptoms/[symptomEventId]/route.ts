import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { updateSymptomEvent } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string; symptomEventId: string }> };

/**
 * PATCH .../symptoms/{symptomEventId}（補充內容／狀態轉換；本輪無 DELETE，見 A107）。
 * isAdverseEvent 可事後回溯標記為 true，同樣觸發不良反應暫停鏈（A105）。
 */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { description?: string; status?: string; isAdverseEvent?: boolean };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }

  const { id, planId, symptomEventId } = await context.params;
  const result = await updateSymptomEvent(auth.userId, id, planId, symptomEventId, body);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "PATCH",
      });
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    if (result.code === "INVALID_REQUEST") {
      return apiError("INVALID_REQUEST", "狀態值不正確", 400, requestId);
    }
    return apiError("NOT_FOUND", "找不到這筆症狀事件。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ symptomEvent: result.symptomEvent }, requestId), auth);
});
