import { NextRequest, NextResponse } from "next/server";
import { describe, expect, it, vi } from "vitest";
import { withErrorEnvelope } from "@/lib/api-handler";

/**
 * 防回歸測試（KB-009）：route handler 內任何未捕捉例外
 * 必須轉為統一 500 error envelope，不得裸露成空 body／不一致狀態。
 */
describe("withErrorEnvelope", () => {
  it("正常 handler 原樣放行", async () => {
    const handler = withErrorEnvelope(async () => NextResponse.json({ ok: true }));
    const response = await handler(new NextRequest("http://localhost/api/x"));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ ok: true });
  });

  it("拋出例外時回統一 500 error envelope，不洩漏例外內容", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const handler = withErrorEnvelope(async () => {
      throw new Error("包含機密內容的內部錯誤細節");
    });
    const response = await handler(new NextRequest("http://localhost/api/x"));
    expect(response.status).toBe(500);

    const body = await response.json();
    expect(body.error.code).toBe("INTERNAL_ERROR");
    expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.stringify(body)).not.toContain("包含機密內容");
    spy.mockRestore();
  });
});
