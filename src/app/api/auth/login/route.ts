import type { NextRequest } from "next/server";
import { apiError, apiOk, newRequestId } from "@/lib/api-response";
import { logger } from "@/lib/logger";
import { getAuthService } from "@/modules/auth";
import { setSessionCookie } from "@/lib/session-cookie";

/** POST /api/auth/login（AC-3／AC-4／AC-5；C6／C7／C8） */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  let body: { email?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.email || !body.password) {
    return apiError("INVALID_REQUEST", "請填寫 Email 與密碼", 400, requestId);
  }

  const result = await getAuthService().login({
    email: body.email,
    password: body.password,
  });

  logger.info("登入請求", {
    requestId,
    path: "/api/auth/login",
    method: "POST",
    status: result.ok ? "ok" : result.code,
  });

  if (!result.ok) {
    if (result.code === "AUTH_LOCKED") {
      return apiError(
        "AUTH_LOCKED",
        "嘗試次數過多，帳號暫時鎖定。請稍後再試；若忘記密碼，可使用「忘記密碼」重設。",
        429,
        requestId,
      );
    }
    // 統一訊息，不洩漏帳號是否存在
    return apiError(
      "AUTH_INVALID_CREDENTIALS",
      "Email 或密碼不正確。請再試一次，或使用「忘記密碼」。",
      401,
      requestId,
    );
  }

  const response = apiOk(
    { status: "ok", emailVerified: result.emailVerified }, // C6：未驗證亦可登入，前端據此顯示提醒
    requestId,
  );
  setSessionCookie(response, result.token, result.expiresAt);
  return response;
}
