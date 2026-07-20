import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { deleteCheckIn, updateCheckIn } from "@/modules/plans";

type Context = { params: Promise<{ id: string; planId: string; checkInId: string }> };

function denyAccess(requestId: string, userId: string, projectId: string, path: string, method: string) {
  auditAccessDenied({ requestId, userId, projectId, path, method });
  return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
}

/** PATCH .../check-ins/{checkInId}（更正，status→corrected） */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { value?: string; note?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }

  const { id, planId, checkInId } = await context.params;
  const result = await updateCheckIn(auth.userId, id, planId, checkInId, body);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "PATCH");
    }
    return apiError("NOT_FOUND", "找不到這筆日常回報。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "corrected" }, requestId), auth);
});

/** DELETE .../check-ins/{checkInId} */
export const DELETE = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, planId, checkInId } = await context.params;
  const result = await deleteCheckIn(auth.userId, id, planId, checkInId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      return denyAccess(requestId, auth.userId, id, request.nextUrl.pathname, "DELETE");
    }
    return apiError("NOT_FOUND", "找不到這筆日常回報。", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "deleted" }, requestId), auth);
});
