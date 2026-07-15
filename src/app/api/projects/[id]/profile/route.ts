import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { getProfile, upsertProfile } from "@/modules/profiles";

type Context = { params: Promise<{ id: string }> };

const ACCESS_DENIED_MESSAGE = "你沒有權限查看這個健康專案";

/** GET /api/projects/{id}/profile（AC-1／AC-7）：尚未建立回 profile:null，非 404 */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await getProfile(auth.userId, id);
  if (!result.ok) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "GET",
    });
    return apiError("PROJECT_ACCESS_DENIED", ACCESS_DENIED_MESSAGE, 403, requestId);
  }

  return attachSlidingCookie(apiOk({ profile: result.profile }, requestId), auth);
});

/** PUT /api/projects/{id}/profile（AC-2／AC-3）：autosave 上寫，OCC 樂觀鎖 */
export const PUT = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { data?: unknown; version?: number };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (
    typeof body.data !== "object" ||
    body.data === null ||
    Array.isArray(body.data) ||
    (body.version !== undefined && typeof body.version !== "number")
  ) {
    return apiError("INVALID_REQUEST", "背景資料格式不正確", 400, requestId);
  }

  const { id } = await context.params;
  const result = await upsertProfile(
    auth.userId,
    id,
    body.data as Record<string, unknown>,
    body.version,
  );
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "PUT",
      });
      return apiError("PROJECT_ACCESS_DENIED", ACCESS_DENIED_MESSAGE, 403, requestId);
    }
    return apiError(
      "VERSION_CONFLICT",
      "此背景資料已在其他位置更新，請重新整理後再試一次。",
      409,
      requestId,
    );
  }

  return attachSlidingCookie(apiOk({ profile: result.profile }, requestId), auth);
});
