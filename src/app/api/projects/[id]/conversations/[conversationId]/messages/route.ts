import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { listMessages, sendMessage } from "@/modules/conversations";

type Context = { params: Promise<{ id: string; conversationId: string }> };

/** GET /api/projects/{id}/conversations/{conversationId}/messages（E4-F3 PoC 2/2；歷史訊息，供 UI 顯示） */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, conversationId } = await context.params;
  const result = await listMessages(auth.userId, id, conversationId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "GET",
      });
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    return apiError("NOT_FOUND", "找不到這個對話", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ messages: result.messages }, requestId), auth);
});

/**
 * POST /api/projects/{id}/conversations/{conversationId}/messages（E4-F3 PoC 1/2）。
 * 建立使用者訊息＋助理訊息（status=queued）；真正的生成串流由前端接著呼叫
 * GET .../messages/{messageId}/stream 觸發（上游 §22.5 兩段式設計）。
 * 日誌不含 content（AC-9，健康內容不入日誌）。
 */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, conversationId } = await context.params;
  const body = (await request.json()) as { content?: string };
  if (!body.content || !body.content.trim()) {
    return apiError("INTERNAL_ERROR", "問題內容不可為空", 400, requestId);
  }

  const result = await sendMessage(auth.userId, id, conversationId, body.content);
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
    if (result.code === "RATE_LIMITED") {
      // C17：超量溫和提示，非指責語氣（A79）
      return apiError("RATE_LIMITED", "今天已經問了不少問題了，明天再繼續聊聊吧！", 429, requestId);
    }
    return apiError("NOT_FOUND", "找不到這個對話", 404, requestId);
  }

  return attachSlidingCookie(apiOk({ messageId: result.messageId }, requestId), auth);
});
