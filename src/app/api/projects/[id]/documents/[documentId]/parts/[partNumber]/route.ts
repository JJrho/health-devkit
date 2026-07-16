import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { getStorageAdapter, uploadPart } from "@/modules/documents";

type Context = { params: Promise<{ id: string; documentId: string; partNumber: string }> };

/** PUT /api/projects/{id}/documents/{documentId}/parts/{partNumber}（AC-3；重試：同號覆寫） */
export const PUT = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, documentId, partNumber } = await context.params;
  const partNumberInt = Number(partNumber);
  if (!Number.isInteger(partNumberInt) || partNumberInt < 1) {
    return apiError("INVALID_REQUEST", "part number 必須是正整數", 400, requestId);
  }

  const body = Buffer.from(await request.arrayBuffer());
  const result = await uploadPart(
    getStorageAdapter(),
    auth.userId,
    id,
    documentId,
    partNumberInt,
    body,
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
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    return apiError(result.code, "上傳分段失敗，請確認會話狀態", 400, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "received" }, requestId), auth);
});
