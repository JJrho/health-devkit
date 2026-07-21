import { apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { getQueueAdapter } from "@/modules/documents";
import { cancelAccountDeletion, requestAccountDeletion } from "@/modules/account/deletion";

/** POST /api/auth/me/deletion（AC-1；C10 三十日冷靜期申請刪除） */
export const POST = withErrorEnvelope(async (request, requestId) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { deletionRequestedAt } = await requestAccountDeletion(
    getQueueAdapter(),
    auth.userId,
    requestId,
  );

  return attachSlidingCookie(
    apiOk({ deletionRequestedAt: deletionRequestedAt.toISOString() }, requestId),
    auth,
  );
});

/** DELETE /api/auth/me/deletion（AC-2；撤銷刪除申請） */
export const DELETE = withErrorEnvelope(async (request, requestId) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  await cancelAccountDeletion(auth.userId, requestId);

  return attachSlidingCookie(apiOk({ deletionRequestedAt: null }, requestId), auth);
});
