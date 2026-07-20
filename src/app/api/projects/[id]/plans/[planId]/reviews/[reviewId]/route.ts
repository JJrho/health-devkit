import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { completeReview } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string; reviewId: string }> };

/**
 * PATCH .../reviews/{reviewId}（送出十分類判斷；A114 白名單驗證，A112 completed 後不可再 PATCH）。
 */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { classification?: string; notes?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.classification) {
    return apiError("INVALID_REQUEST", "請選擇一個檢討分類", 400, requestId);
  }

  const { id, planId, reviewId } = await context.params;
  const result = await completeReview(auth.userId, id, planId, reviewId, {
    classification: body.classification,
    notes: body.notes,
  });
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
      return apiError("INVALID_REQUEST", "分類值不正確，或這筆檢討已完成", 409, requestId);
    }
    return apiError("NOT_FOUND", "找不到這筆檢討。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ review: result.review }, requestId), auth);
});
