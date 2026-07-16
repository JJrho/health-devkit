import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { listDocuments } from "@/modules/documents";

type Context = { params: Promise<{ id: string }> };

/** GET /api/projects/{id}/documents（列表，排除已刪除） */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await listDocuments(auth.userId, id);
  if (!result.ok) {
    return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
  }

  return attachSlidingCookie(apiOk({ items: result.items }, requestId), auth);
});
