import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { deleteEscalationSummary, updateEscalationSummary } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string; summaryId: string }> };

function denyAccess(requestId: string, userId: string, projectId: string, path: string, method: string) {
  auditAccessDenied({ requestId, userId, projectId, path, method });
  return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
}

/** PATCH .../escalation-summary/{summaryId}（狀態轉換：draft→ready→exported） */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { status?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.status) {
    return apiError("INVALID_REQUEST", "請提供狀態", 400, requestId);
  }

  const { id, planId, summaryId } = await context.params;
  const result = await updateEscalationSummary(auth.userId, id, planId, summaryId, { status: body.status });
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "PATCH");
    }
    if (result.code === "INVALID_REQUEST") {
      return apiError("INVALID_REQUEST", "狀態值不正確", 400, requestId);
    }
    return apiError("NOT_FOUND", "找不到這筆轉介摘要。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ summary: result.summary }, requestId), auth);
});

/** DELETE .../escalation-summary/{summaryId}（狀態轉為 deleted） */
export const DELETE = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, planId, summaryId } = await context.params;
  const result = await deleteEscalationSummary(auth.userId, id, planId, summaryId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "DELETE");
    }
    return apiError("NOT_FOUND", "找不到這筆轉介摘要。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "deleted" }, requestId), auth);
});
