import { apiOk, newRequestId } from "@/lib/api-response";
import { logger } from "@/lib/logger";

/**
 * 健康檢查端點（Sprint 2 AC-4；OpenAPI: /api/health）。
 * 不連 DB——回報的是 Web 進程本身存活；DB 健康屬監控範疇（E6-F2）。
 */
export function GET() {
  const requestId = newRequestId();
  logger.info("health check", {
    requestId,
    path: "/api/health",
    method: "GET",
    httpStatus: 200,
  });
  return apiOk({ status: "ok" }, requestId);
}
