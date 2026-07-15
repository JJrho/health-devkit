import type { NextRequest, NextResponse } from "next/server";
import { apiError, newRequestId } from "./api-response";
import { logger } from "./logger";

/**
 * 路由層安全網：任何 handler 內未捕捉的例外（adapter／DB 非預期錯誤）
 * 一律轉為統一 500 error envelope，絕不讓例外裸露成空 body（曾發生：
 * 例外導致回應狀態與內容不一致，前端誤判為連線問題，見 KB-009）。
 */
export function withErrorEnvelope<Context = unknown>(
  handler: (request: NextRequest, requestId: string, context: Context) => Promise<NextResponse>,
) {
  return async (request: NextRequest, context: Context): Promise<NextResponse> => {
    const requestId = newRequestId();
    try {
      return await handler(request, requestId, context);
    } catch (error) {
      const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
      logger.error("API 未預期例外", {
        requestId,
        path: request.nextUrl.pathname,
        method: request.method,
        errorName,
      });
      return apiError(
        "INTERNAL_ERROR",
        "系統發生問題，請稍後再試。若持續發生，請聯絡我們。",
        500,
        requestId,
      );
    }
  };
}
