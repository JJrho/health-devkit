import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { createPlan, listPlans } from "@/modules/plans";

type Context = { params: Promise<{ id: string }> };

function denyAccess(requestId: string, userId: string, projectId: string, path: string, method: string) {
  auditAccessDenied({ requestId, userId, projectId, path, method });
  return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
}

/** POST /api/projects/{id}/plans（E5-F1 Part 1/2；建立計畫草稿，安全欄位可留空） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: {
    title?: string;
    baseline?: string;
    riskNote?: string;
    stopCondition?: string;
    referralCondition?: string;
    reviewDate?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.title || typeof body.title !== "string") {
    return apiError("INVALID_REQUEST", "請提供計畫標題", 400, requestId);
  }

  const { id } = await context.params;
  const result = await createPlan(auth.userId, id, {
    title: body.title,
    baseline: body.baseline,
    riskNote: body.riskNote,
    stopCondition: body.stopCondition,
    referralCondition: body.referralCondition,
    reviewDate: body.reviewDate ? new Date(body.reviewDate) : undefined,
  });
  if (!result.ok) {
    return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "POST");
  }

  return attachSlidingCookie(apiOk({ planId: result.planId }, requestId), auth);
});

/** GET /api/projects/{id}/plans（列表，排除已軟刪除） */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await listPlans(auth.userId, id);
  if (!result.ok) {
    return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "GET");
  }

  return attachSlidingCookie(apiOk({ plans: result.plans }, requestId), auth);
});
