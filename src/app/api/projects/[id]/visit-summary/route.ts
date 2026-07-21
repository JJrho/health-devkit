import { apiError, apiOk } from "@/lib/api-response";
import { withErrorEnvelope } from "@/lib/api-handler";
import { attachSlidingCookie, requireSession } from "@/lib/require-session";
import { auditAccessDenied } from "@/modules/projects";
import { buildVisitSummary, type VisitSummarySections } from "@/modules/reports";

type Context = { params: Promise<{ id: string }> };

/** POST /api/projects/{id}/visit-summary（E5-F4／C19；即時彙整，不落地儲存，見 A128） */
export const POST = withErrorEnvelope<Context>(async (request, requestId, context) => {
  const auth = await requireSession(request, requestId);
  if (!("userId" in auth)) return auth;

  let body: {
    sections?: Partial<VisitSummarySections>;
    trendFrom?: string;
    trendTo?: string;
    symptomFrom?: string;
    symptomTo?: string;
    question?: string;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }

  const sections: VisitSummarySections = {
    background: Boolean(body.sections?.background),
    trends: Boolean(body.sections?.trends),
    plans: Boolean(body.sections?.plans),
    symptoms: Boolean(body.sections?.symptoms),
    questions: Boolean(body.sections?.questions),
  };
  if (!Object.values(sections).some(Boolean)) {
    return apiError("INVALID_REQUEST", "請至少勾選一個區塊", 400, requestId);
  }

  const { id } = await context.params;
  const result = await buildVisitSummary(auth.userId, id, {
    sections,
    trendFrom: body.trendFrom,
    trendTo: body.trendTo,
    symptomFrom: body.symptomFrom,
    symptomTo: body.symptomTo,
    question: body.question,
  });

  if (!result.ok) {
    auditAccessDenied({
      requestId,
      userId: auth.userId,
      projectId: id,
      path: request.nextUrl.pathname,
      method: "POST",
    });
    return apiError("PROJECT_ACCESS_DENIED", "你沒有權限查看這個健康專案", 403, requestId);
  }

  return attachSlidingCookie(apiOk({ summary: result.data }, requestId), auth);
});
