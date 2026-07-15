import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied, deleteProject, getProject, renameProject } from "@/modules/projects";

type Context = { params: Promise<{ id: string }> };

const ACCESS_DENIED_MESSAGE = "你沒有權限查看這個健康專案";

/** GET /api/projects/{id}（AC-6／AC-7）：四層鏈第 2～4 層＋標記最近存取 */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const project = await getProject(auth.userId, id);
  if (!project) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "GET",
    });
    return apiError("PROJECT_ACCESS_DENIED", ACCESS_DENIED_MESSAGE, 403, requestId);
  }

  return attachSlidingCookie(apiOk({ project }, requestId), auth);
});

/** PATCH /api/projects/{id}（AC-3）：改名＋OCC，version 不符回 VERSION_CONFLICT */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { name?: string; version?: number };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  const name = body.name?.trim();
  if (!name || typeof body.version !== "number") {
    return apiError("INVALID_REQUEST", "請提供專案名稱與目前版本號", 400, requestId);
  }

  const { id } = await context.params;
  const result = await renameProject(auth.userId, id, name, body.version);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "PATCH",
      });
      return apiError("PROJECT_ACCESS_DENIED", ACCESS_DENIED_MESSAGE, 403, requestId);
    }
    return apiError(
      "VERSION_CONFLICT",
      "此專案已在其他位置更新，請重新整理後再試一次。",
      409,
      requestId,
    );
  }

  return attachSlidingCookie(apiOk({ project: result.project }, requestId), auth);
});

/** DELETE /api/projects/{id}（AC-5）：軟刪除，任一非刪除狀態→deleted */
export const DELETE = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await deleteProject(auth.userId, id);
  if (!result.ok) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "DELETE",
    });
    return apiError("PROJECT_ACCESS_DENIED", ACCESS_DENIED_MESSAGE, 403, requestId);
  }

  return attachSlidingCookie(apiOk({ project: result.project }, requestId), auth);
});
