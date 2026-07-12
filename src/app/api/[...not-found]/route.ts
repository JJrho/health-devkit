import { apiError } from "@/lib/api-response";

/**
 * API 命名空間 catch-all：未定義端點回統一 error envelope（AC-4），
 * 不落入 Next 預設 HTML 404。
 */
function notFound() {
  return apiError("NOT_FOUND", "端點不存在", 404);
}

export const GET = notFound;
export const POST = notFound;
export const PUT = notFound;
export const PATCH = notFound;
export const DELETE = notFound;
