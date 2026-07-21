import { Readable } from "node:stream";
import { NextResponse } from "next/server";
import { apiError } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { exportProjectData } from "@/modules/reports";

type Context = { params: Promise<{ id: string }> };

/**
 * GET /api/projects/{id}/export（E5-F4／C20；單一專案，A130）。
 * 直接串流 ZIP 二進位回應（A132：原始檔不簽發對外連結，伺服器端組裝後直接回傳）。
 */
export const GET = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  const { id } = await context.params;
  const result = await exportProjectData(auth.userId, id);

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

  const webStream = Readable.toWeb(result.archive as unknown as Readable) as ReadableStream;
  const response = new NextResponse(webStream, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="export.zip"; filename*=UTF-8''${encodeURIComponent(result.filename)}`,
    },
  });
  return attachSlidingCookie(response, auth);
});
