import type { NextRequest } from "next/server";
import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { deleteExtractedItem, updateExtractedItem } from "@/modules/extraction";

type Context = { params: Promise<{ id: string; documentId: string; extractionId: string }> };

const ERROR_MESSAGES: Record<string, string> = {
  NOT_FOUND: "找不到這筆候選列。",
  VERSION_CONFLICT: "這筆資料已在其他位置更新，請重新整理後再試一次。",
  INVALID_REQUEST: "這份文件已確認或不在可編輯狀態，或請求缺少必要欄位。",
};

function auditDenied(
  requestId: string,
  userId: string,
  projectId: string,
  request: NextRequest,
  method: string,
) {
  auditAccessDenied({
    requestId,
    userId,
    projectId,
    path: request.nextUrl.pathname,
    method,
  });
}

/** PATCH .../extractions/{extractionId}（上游 §28.4「可修改」；編輯內容或變更 accepted/rejected 狀態，AC-1～AC-4） */
export const PATCH = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: {
    version?: number;
    rawTestName?: string;
    rawValue?: string;
    rawUnit?: string | null;
    rawReferenceRange?: string | null;
    status?: "accepted" | "rejected";
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!Number.isInteger(body.version)) {
    return apiError("INVALID_REQUEST", "缺少有效的 version", 400, requestId);
  }

  const { id, documentId, extractionId } = await context.params;
  const result = await updateExtractedItem(auth.userId, id, documentId, extractionId, {
    version: body.version!,
    rawTestName: body.rawTestName,
    rawValue: body.rawValue,
    rawUnit: body.rawUnit,
    rawReferenceRange: body.rawReferenceRange,
    status: body.status,
  });
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditDenied(requestId, auth.userId, id, request, "PATCH");
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    const status = result.code === "VERSION_CONFLICT" ? 409 : result.code === "NOT_FOUND" ? 404 : 400;
    return apiError(result.code, ERROR_MESSAGES[result.code] ?? "更新失敗", status, requestId);
  }

  return attachSlidingCookie(apiOk({ item: result.item }, requestId), auth);
});

/** DELETE .../extractions/{extractionId}（上游 §28.4／§17「刪除」；徹底移除，與 rejected 不同語意，A37） */
export const DELETE = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, documentId, extractionId } = await context.params;
  const result = await deleteExtractedItem(auth.userId, id, documentId, extractionId);
  if (!result.ok) {
    if (result.code === "PROJECT_ACCESS_DENIED") {
      auditDenied(requestId, auth.userId, id, request, "DELETE");
      return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
    }
    return apiError("NOT_FOUND", ERROR_MESSAGES.NOT_FOUND!, 404, requestId);
  }

  return attachSlidingCookie(apiOk({ status: "deleted" }, requestId), auth);
});
