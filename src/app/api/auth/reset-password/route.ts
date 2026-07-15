import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { getAuthService } from "@/modules/auth";

/** POST /api/auth/reset-password（AC-6；C9：30 分鐘、單次有效） */
export const POST = withErrorEnvelope(async (request, requestId) => {
  let body: { tokenHash?: string; newPassword?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.tokenHash || !body.newPassword) {
    return apiError("INVALID_REQUEST", "缺少重設資訊", 400, requestId);
  }

  const ok = await getAuthService().resetPassword(body.tokenHash, body.newPassword);
  if (!ok) {
    return apiError(
      "RESET_TOKEN_INVALID",
      "重設連結已過期或已使用。請回到「忘記密碼」重新申請一封信。",
      400,
      requestId,
    );
  }
  return apiOk({ status: "password-reset" }, requestId);
});
