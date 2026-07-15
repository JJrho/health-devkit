import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { createProject, listProjects } from "@/modules/projects";

/** POST /api/projects（AC-1；C6：未驗證帳號亦可建立） */
export const POST = withErrorEnvelope(async (request, requestId) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  const name = body.name?.trim();
  if (!name) return apiError("INVALID_REQUEST", "請輸入專案名稱", 400, requestId);

  const project = await createProject(auth.userId, name);
  return attachSlidingCookie(apiOk({ project }, requestId), auth);
});

/** GET /api/projects（AC-2）：排除已刪除，標示最近存取專案供重新登入導向 */
export const GET = withErrorEnvelope(async (request, requestId) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { items, mostRecentProjectId } = await listProjects(auth.userId);
  return attachSlidingCookie(apiOk({ items, mostRecentProjectId }, requestId), auth);
});
