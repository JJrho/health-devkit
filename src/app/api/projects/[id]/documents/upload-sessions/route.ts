import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { isEmailVerified } from "@/lib/require-verified-email";
import { auditAccessDenied } from "@/modules/projects";
import { createUploadSession } from "@/modules/documents";

type Context = { params: Promise<{ id: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  DOCUMENT_QUOTA_EXCEEDED: "這個專案的文件數量已達上限（200 份），請先刪除不需要的文件。",
};

/** POST /api/projects/{id}/documents/upload-sessions（AC-1／AC-2；C6：未驗證帳號鎖定上傳） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  if (!(await isEmailVerified(auth.userId))) {
    return apiError(
      "EMAIL_VERIFICATION_REQUIRED",
      "請先完成 Email 驗證才能上傳文件。",
      403,
      requestId,
    );
  }

  let body: { idempotencyKey?: string; filename?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.idempotencyKey || !body.filename) {
    return apiError("INVALID_REQUEST", "缺少 idempotencyKey 或 filename", 400, requestId);
  }

  const { id } = await context.params;
  const result = await createUploadSession(auth.userId, id, {
    idempotencyKey: body.idempotencyKey,
    filename: body.filename,
  });
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
    return apiError(
      result.code,
      ERROR_MESSAGES[result.code] ?? "建立上傳會話失敗",
      400,
      requestId,
    );
  }

  return attachSlidingCookie(apiOk({ document: result.document }, requestId), auth);
});
