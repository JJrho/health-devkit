import { eq } from "drizzle-orm";
import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { listProjects } from "@/modules/projects";

/** GET /api/auth/me（AC-3／AC-4／AC-7；E1-F4：附最近專案供重新登入導向） */
export const GET = withErrorEnvelope(async (request, requestId) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const rows = await getDb()
    .select({ email: users.email, emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, auth.userId))
    .limit(1);
  const user = rows[0];
  if (!user) return apiError("AUTH_REQUIRED", "請先登入", 401, requestId);

  const { mostRecentProjectId } = await listProjects(auth.userId);

  return attachSlidingCookie(
    apiOk(
      {
        email: user.email,
        emailVerified: user.emailVerified,
        mostRecentProjectId,
      },
      requestId,
    ),
    auth,
  );
});
