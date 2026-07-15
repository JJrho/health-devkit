import { apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { getAuthService } from "@/modules/auth";
import { clearSessionCookie, readSessionToken } from "@/lib/session-cookie";

/** POST /api/auth/logout（AC-7）：撤銷 session＋清 cookie；冪等 */
export const POST = withErrorEnvelope(async (request, requestId) => {
  const token = readSessionToken(request);
  if (token) await getAuthService().logout(token);

  const response = apiOk({ status: "logged-out" }, requestId);
  clearSessionCookie(response);
  return response;
});
