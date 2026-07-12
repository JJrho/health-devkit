import type { NextRequest } from "next/server";
import { apiOk, newRequestId } from "@/lib/api-response";
import { getAuthService } from "@/modules/auth";
import { clearSessionCookie, readSessionToken } from "@/lib/session-cookie";

/** POST /api/auth/logout（AC-7）：撤銷 session＋清 cookie；冪等 */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  const token = readSessionToken(request);
  if (token) await getAuthService().logout(token);

  const response = apiOk({ status: "logged-out" }, requestId);
  clearSessionCookie(response);
  return response;
}
