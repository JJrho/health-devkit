import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { confirmDocument } from "@/modules/extraction";

type Context = { params: Promise<{ id: string; documentId: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "這份文件目前不在可確認的狀態（需先完成解析且尚未確認過）。",
  PENDING_REVIEW_ITEMS: "還有候選列尚未處理（編輯／接受／拒絕），請全部審查完畢後再確認。",
};

/** POST .../confirm（上游 §18.1：review_required → confirmed；A38：要求全部候選列已審查，AC-7／AC-8） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, documentId } = await context.params;
  const result = await confirmDocument(auth.userId, id, documentId);
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
    return apiError(result.code, ERROR_MESSAGES[result.code] ?? "確認失敗", 400, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "confirmed" }, requestId), auth);
});
