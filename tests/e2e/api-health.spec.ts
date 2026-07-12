import { expect, test } from "@playwright/test";

/**
 * AC-4：health 端點與統一 error envelope。
 */
test("GET /api/health 回 200＋status ok＋request_id", async ({ request }) => {
  const response = await request.get("/api/health");
  expect(response.status()).toBe(200);

  const body = await response.json();
  expect(body.status).toBe("ok");
  expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
  expect(response.headers()["x-request-id"]).toBe(body.request_id);
});

test("未定義 API 端點回統一 error envelope", async ({ request }) => {
  const response = await request.get("/api/no-such-endpoint");
  expect(response.status()).toBe(404);

  const body = await response.json();
  expect(body.error.code).toBe("NOT_FOUND");
  expect(body.error.message).toBeTruthy();
  expect(body.request_id).toMatch(/^[0-9a-f-]{36}$/);
});
