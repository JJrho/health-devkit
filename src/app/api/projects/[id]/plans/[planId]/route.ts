import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { deletePlan, getPlan, updatePlan } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "找不到這個行動計畫。",
  INVALID_REQUEST: "此計畫目前狀態無法編輯（已停止或已封存）。",
  PLAN_ADVERSE_EVENT: "已暫停相關行動，請先處理不舒服事件",
};

function denyAccess(requestId: string, userId: string, projectId: string, path: string, method: string) {
  auditAccessDenied({ requestId, userId, projectId, path, method });
  return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
}

/** GET .../plans/{planId} */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, planId } = await context.params;
  const result = await getPlan(auth.userId, id, planId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "GET");
    }
    return apiError("NOT_FOUND", ERROR_MESSAGES.NOT_FOUND!, 404, requestId);
  }

  return attachSlidingCookie(
    apiOk(
      {
        plan: result.plan,
        actions: result.actions,
        metrics: result.metrics,
        checkIns: result.checkIns,
        symptomEvents: result.symptomEvents,
      },
      requestId,
    ),
    auth,
  );
});

/**
 * PATCH .../plans/{planId}——`draft`／`needs_info` 就地編輯；`active`／`paused`
 * 改為新增版本（A96），回應的 `plan.id` 會是新版本 id，前端需以此更新本地狀態；
 * `stopped`／`archived` 一律拒絕（409）。
 */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
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

  const { id, planId } = await context.params;
  const result = await updatePlan(auth.userId, id, planId, {
    title: body.title,
    baseline: body.baseline,
    riskNote: body.riskNote,
    stopCondition: body.stopCondition,
    referralCondition: body.referralCondition,
    reviewDate: body.reviewDate ? new Date(body.reviewDate) : undefined,
  });
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "PATCH");
    }
    const status = result.code === "INVALID_REQUEST" || result.code === "PLAN_ADVERSE_EVENT" ? 409 : 404;
    return apiError(result.code, ERROR_MESSAGES[result.code] ?? "更新失敗", status, requestId);
  }

  return attachSlidingCookie(apiOk({ plan: result.plan }, requestId), auth);
});

/** DELETE .../plans/{planId}（軟刪除） */
export const DELETE = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, planId } = await context.params;
  const result = await deletePlan(auth.userId, id, planId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "DELETE");
    }
    return apiError("NOT_FOUND", ERROR_MESSAGES.NOT_FOUND!, 404, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "deleted" }, requestId), auth);
});
