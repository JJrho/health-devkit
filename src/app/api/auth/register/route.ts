import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { logger } from "@/lib/logger";
import { getAuthService } from "@/modules/auth";

/** POST /api/auth/register（AC-1／AC-2；C11） */
export const POST = withErrorEnvelope(async (request, requestId) => {
  let body: {
    email?: string;
    password?: string;
    agreeTermsAndDisclaimer?: boolean;
    declareAge18?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.email || !body.password) {
    return apiError("INVALID_REQUEST", "請填寫 Email 與密碼", 400, requestId);
  }

  const origin = request.nextUrl.origin;
  const result = await getAuthService().register({
    email: body.email,
    password: body.password,
    agreeTermsAndDisclaimer: Boolean(body.agreeTermsAndDisclaimer),
    declareAge18: Boolean(body.declareAge18),
    verifyRedirectTo: `${origin}/auth/verified`,
  });

  logger.info("註冊請求", {
    requestId,
    path: "/api/auth/register",
    method: "POST",
    status: result.ok ? "ok" : result.code,
  });

  if (!result.ok) {
    switch (result.code) {
      case "EMAIL_EXISTS":
        // SDD §4.1：明確提示既有帳號（溫和語氣，附下一步）
        return apiError(
          "EMAIL_EXISTS",
          "這個 Email 已經註冊過了。您可以直接登入；若忘記密碼，可從登入頁重設。",
          409,
          requestId,
        );
      case "CONSENT_REQUIRED":
        return apiError(
          "CONSENT_REQUIRED",
          "請先閱讀並勾選服務條款與醫療免責聲明，並確認您已年滿 18 歲。",
          400,
          requestId,
        );
      case "WEAK_PASSWORD":
        return apiError("WEAK_PASSWORD", "密碼長度至少需要 8 個字元。", 400, requestId);
      case "INVALID_EMAIL":
        return apiError(
          "INVALID_EMAIL",
          "這個 Email 地址格式看起來不正確，請確認後再試一次。",
          400,
          requestId,
        );
      case "EMAIL_RATE_LIMITED":
        return apiError(
          "EMAIL_RATE_LIMITED",
          "系統寄送驗證信的數量已達暫時上限，請稍後再試（通常數十分鐘內恢復）。",
          429,
          requestId,
        );
    }
  }

  return apiOk({ status: "registered" }, requestId);
});
