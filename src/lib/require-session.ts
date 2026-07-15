import { NextResponse, type NextRequest } from "next/server";
import { apiError } from "./api-response";
import { readSessionToken, setSessionCookie } from "./session-cookie";
import { validateSession } from "@/modules/auth";

export interface AuthedRequest {
  userId: string;
  token: string;
  slidExpiresAt: Date | null;
}

/**
 * 權限鏈第 1 層（登入）——供各需登入之路由共用（E1-F4 起首個橫跨多路由共用點）。
 * 回傳 NextResponse 表示應直接回應呼叫端（未登入／session 過期，統一 401 AUTH_REQUIRED）。
 */
export async function requireSession(
  request: NextRequest,
  requestId: string,
): Promise<AuthedRequest | NextResponse> {
  const token = readSessionToken(request);
  if (!token) return apiError("AUTH_REQUIRED", "請先登入", 401, requestId);

  const session = await validateSession(token);
  if (!session) return apiError("AUTH_REQUIRED", "請先登入", 401, requestId);

  return { userId: session.userId, token, slidExpiresAt: session.slidExpiresAt };
}

/** session 因活動而滑動展延時，回應也需同步展延 cookie（C8） */
export function attachSlidingCookie(
  response: NextResponse,
  auth: AuthedRequest,
): NextResponse {
  if (auth.slidExpiresAt) setSessionCookie(response, auth.token, auth.slidExpiresAt);
  return response;
}
