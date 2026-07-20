import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { getAuthService } from "@/modules/auth";
import { setSessionCookie } from "@/lib/session-cookie";

/**
 * POST /api/auth/google（E1-F3；AC-1～AC-4）。
 * 請求體帶前端從 Supabase OAuth 導向流程取得的 access_token（A122），
 * 由伺服器驗證真偽後建立本系統自有 session，不信任前端宣稱的身分。
 */
export const POST = withErrorEnvelope(async (request, requestId) => {
  let body: {
    accessToken?: string;
    agreeTermsAndDisclaimer?: boolean;
    declareAge18?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.accessToken) {
    return apiError("INVALID_REQUEST", "缺少 Google 登入憑證", 400, requestId);
  }

  const result = await getAuthService().loginWithGoogle({
    accessToken: body.accessToken,
    agreeTermsAndDisclaimer: body.agreeTermsAndDisclaimer,
    declareAge18: body.declareAge18,
  });

  // A127：accessToken／email 不入日誌，僅記錄成功／失敗狀態碼
  logger.info("Google 登入請求", {
    requestId,
    path: "/api/auth/google",
    method: "POST",
    status: result.ok ? "ok" : result.code,
  });

  if (!result.ok) {
    if (result.code === "CONSENT_REQUIRED") {
      return apiError(
        "CONSENT_REQUIRED",
        "第一次使用 Google 登入前，請先至建立帳號頁閱讀並勾選服務條款與醫療免責聲明。",
        400,
        requestId,
      );
    }
    return apiError("AUTH_GOOGLE_FAILED", "Google 登入未完成，請重新嘗試。", 401, requestId);
  }

  const response = apiOk({ status: "ok", emailVerified: result.emailVerified }, requestId);
  setSessionCookie(response, result.token, result.expiresAt);
  return response;
});
