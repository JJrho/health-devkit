import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { deleteObservation, updateObservation } from "@/modules/observations";

type Context = { params: Promise<{ id: string; observationId: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "找不到這筆正式紀錄。",
  VERSION_CONFLICT: "這筆資料已在其他位置更新，請重新整理後再試一次。",
};

/** PATCH .../observations/{observationId}（E2-F4，A42：整列新增＋前版 superseded，非原地覆寫，AC-5） */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { version?: number; numericValue?: string; unit?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!Number.isInteger(body.version)) {
    return apiError("INVALID_REQUEST", "缺少有效的 version", 400, requestId);
  }

  const { id, observationId } = await context.params;
  const result = await updateObservation(auth.userId, id, observationId, {
    version: body.version!,
    numericValue: body.numericValue,
    unit: body.unit,
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
    const status = result.code === "VERSION_CONFLICT" ? 409 : 404;
    return apiError(result.code, ERROR_MESSAGES[result.code] ?? "更新失敗", status, requestId);
  }

  return attachSlidingCookie(apiOk({ item: result.item }, requestId), auth);
});

/** DELETE .../observations/{observationId}（E2-F4；軟刪除） */
export const DELETE = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, observationId } = await context.params;
  const result = await deleteObservation(auth.userId, id, observationId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "DELETE",
      });
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    return apiError("NOT_FOUND", ERROR_MESSAGES.NOT_FOUND!, 404, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "deleted" }, requestId), auth);
});
