import { NextResponse, type NextRequest } from "next/server";
import { apiError, newRequestId } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { requireSession } from "@/lib/require-session";
import { auditAccessDenied, findOwnedProject } from "@/modules/projects";
import { findOwnedConversation, getLlmAdapter, runAssistantMessage } from "@/modules/conversations";

type Context = { params: Promise<{ id: string; conversationId: string; messageId: string }> };

/**
 * GET /api/projects/{id}/conversations/{conversationId}/messages/{messageId}/stream
 * （E4-F3 PoC 1/2；SSE，技術選型 §11.3）。
 * 未走 withErrorEnvelope（回傳型別非 JSON envelope），例外於串流迴圈內自行
 * 轉為 stream_failed 事件，不讓例外導致連線裸露中斷（比照 KB-009 精神）。
 */
export async function GET(request: NextRequest, context: Context): Promise<Response> {
  const requestId = newRequestId();
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, conversationId, messageId } = await context.params;

  const project = await findOwnedProject(auth.userId, id);
  if (!project) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "GET",
    });
    return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
  }
  const conversation = await findOwnedConversation(auth.userId, id, conversationId);
  if (!conversation) {
    return apiError("NOT_FOUND", "找不到這個對話", 404, requestId);
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const event of runAssistantMessage(messageId, project.id, getLlmAdapter())) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        }
      } catch (err) {
        logger.error("SSE 串流路由層例外", {
          requestId,
          errorName: err instanceof Error ? err.constructor.name : "UnknownError",
        });
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify({ type: "stream_failed", errorCode: "INTERNAL_ERROR" })}\n\n`),
        );
      } finally {
        controller.close();
      }
    },
  });

  return new NextResponse(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "x-request-id": requestId,
    },
  });
}
