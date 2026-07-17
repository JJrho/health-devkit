import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { createExtractedItem, listExtractedItems } from "@/modules/extraction";

type Context = { params: Promise<{ id: string; documentId: string }> };

/** GET /api/projects/{id}/documents/{documentId}/extractions（唯讀，四層鏈重用） */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id, documentId } = await context.params;
  const result = await listExtractedItems(auth.userId, id, documentId);
  if (!result.ok) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "GET",
    });
    return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
  }

  return attachSlidingCookie(apiOk({ items: result.items }, requestId), auth);
});

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_REQUEST: "缺少必要欄位，或文件目前不在可新增候選列的狀態。",
};

/** POST /api/projects/{id}/documents/{documentId}/extractions（上游 §28.4「可新增」，AC-5：手動新增候選列） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: {
    rawTestName?: string;
    rawValue?: string;
    rawUnit?: string | null;
    rawReferenceRange?: string | null;
    pageNumber?: number;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.rawTestName || !body.rawValue) {
    return apiError("INVALID_REQUEST", "缺少 rawTestName 或 rawValue", 400, requestId);
  }

  const { id, documentId } = await context.params;
  const result = await createExtractedItem(auth.userId, id, documentId, {
    rawTestName: body.rawTestName,
    rawValue: body.rawValue,
    rawUnit: body.rawUnit,
    rawReferenceRange: body.rawReferenceRange,
    pageNumber: body.pageNumber,
  });
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
    return apiError(result.code, ERROR_MESSAGES[result.code] ?? "新增失敗", 400, requestId);
  }

  return attachSlidingCookie(apiOk({ item: result.item }, requestId), auth);
});
