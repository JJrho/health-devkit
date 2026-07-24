import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { completeUpload, getQueueAdapter, getScanAdapter, getStorageAdapter } from "@/modules/documents";

type Context = { params: Promise<{ id: string; documentId: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  FILE_TOO_LARGE: "檔案超過可上傳大小（單檔 20MB、PDF 30 頁），請確認後再試一次。",
  FILE_TYPE_NOT_SUPPORTED: "此檔案格式目前不支援，僅接受 PDF、JPG、PNG。",
  FILE_CORRUPTED: "無法讀取這個檔案，可能已損毀，請確認後再試一次。",
  MALICIOUS_FILE_DETECTED: "這個檔案被判定為不安全，已拒絕上傳。若您確認檔案無虞，請聯絡我們。",
  FILE_SCAN_FAILED: "安全掃描暫時無法完成，請稍後再試一次。",
  INVALID_REQUEST: "這個上傳會話已完成或已取消，無法再次完成。",
};

/** POST /api/projects/{id}/documents/{documentId}/complete（AC-3～AC-5） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: { totalParts?: number };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!Number.isInteger(body.totalParts) || (body.totalParts ?? 0) < 1) {
    return apiError("INVALID_REQUEST", "缺少有效的 totalParts", 400, requestId);
  }

  const { id, documentId } = await context.params;
  const result = await completeUpload(
    getStorageAdapter(),
    getQueueAdapter(),
    getScanAdapter(),
    auth.userId,
    id,
    documentId,
    body.totalParts!,
  );
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditAccessDenied({
        requestId,
        userId: auth.userId,
        projectId: id,
        path: request.nextUrl.pathname,
        method: "POST",
      });
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    return apiError(
      result.code,
      ERROR_MESSAGES[result.code] ?? "上傳未能完成，請再試一次。",
      400,
      requestId,
    );
  }

  return attachSlidingCookie(apiOk({ document: result.document }, requestId), auth);
});
