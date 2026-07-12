import type { NextRequest } from "next/server";
import { apiError, apiOk, newRequestId } from "@/lib/api-response";
import { getAuthService } from "@/modules/auth";

/** POST /api/auth/forgot-password（AC-6；C9）：一律回成功訊息（防枚舉） */
export async function POST(request: NextRequest) {
  const requestId = newRequestId();
  let body: { email?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("INVALID_REQUEST", "請求格式錯誤", 400, requestId);
  }
  if (!body.email) {
    return apiError("INVALID_REQUEST", "請填寫 Email", 400, requestId);
  }

  await getAuthService().forgotPassword(
    body.email,
    `${request.nextUrl.origin}/reset-password`,
  );
  return apiOk({ status: "reset-email-sent" }, requestId);
}
