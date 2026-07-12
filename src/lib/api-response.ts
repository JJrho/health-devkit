import { NextResponse } from "next/server";

/**
 * API 統一回應基座（SDD §10：error envelope＋request_id）。
 * 錯誤碼採上游 §24 錯誤碼清單；本 Sprint 先落地格式，各碼隨 Feature 增補。
 */
export function newRequestId(): string {
  return crypto.randomUUID();
}

export function apiOk<T extends Record<string, unknown>>(
  data: T,
  requestId: string = newRequestId(),
): NextResponse {
  return NextResponse.json(
    { ...data, request_id: requestId },
    { headers: { "x-request-id": requestId } },
  );
}

export function apiError(
  code: string,
  message: string,
  httpStatus: number,
  requestId: string = newRequestId(),
): NextResponse {
  return NextResponse.json(
    { error: { code, message }, request_id: requestId },
    { status: httpStatus, headers: { "x-request-id": requestId } },
  );
}
