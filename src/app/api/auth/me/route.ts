import { eq } from "drizzle-orm";
import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { validateSession } from "@/modules/auth";
import { readSessionToken, setSessionCookie } from "@/lib/session-cookie";

/** GET /api/auth/me（AC-3／AC-4／AC-7）：session 驗證＋滑動展延＋C6 閘狀態 */
export const GET = withErrorEnvelope(async (request, requestId) => {
  const token = readSessionToken(request);
  if (!token) return apiError("AUTH_REQUIRED", "請先登入", 401, requestId);

  const session = await validateSession(token);
  if (!session) return apiError("AUTH_REQUIRED", "請先登入", 401, requestId);

  const rows = await getDb()
    .select({ email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, session.userId))
    .limit(1);
  const user = rows[0];
  if (!user) return apiError("AUTH_REQUIRED", "請先登入", 401, requestId);

  const response = apiOk(
    { email: user.email, emailVerified: user.emailVerified },
    requestId,
  );
  if (session.slidExpiresAt) {
    setSessionCookie(response, token, session.slidExpiresAt); // cookie 隨 session 一起滑動
  }
  return response;
});
