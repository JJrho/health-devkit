import { describe, expect, it, vi, afterEach } from "vitest";
import { logger, type SafeFields } from "@/lib/logger";

/**
 * AC-5：redaction 執行期防線——繞過型別傳入的非白名單欄位必須被剔除並標記。
 */
describe("logger redaction（憲法 §4 執行期防線）", () => {
  afterEach(() => vi.restoreAllMocks());

  it("非白名單欄位被剔除、值不出現、以 redactedFieldCount 標記", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});

    const unsafe = {
      requestId: "req-1",
      jobId: "job-1",
      payload: { glucose: 128, name: "某使用者" }, // 模擬誤傳健康內容
      signedUrl: "https://storage/secret?sig=abc",
      token: "eyJ-secret",
    } as unknown as SafeFields;

    logger.info("誤傳測試", unsafe);

    const raw = spy.mock.calls[0]![0] as string;
    const entry = JSON.parse(raw);

    expect(entry.requestId).toBe("req-1");
    expect(entry.jobId).toBe("job-1");
    expect(entry.redactedFieldCount).toBe(3);
    expect(entry.payload).toBeUndefined();
    expect(entry.signedUrl).toBeUndefined();
    expect(entry.token).toBeUndefined();
    // 原始輸出字串層面也不得含敏感值
    expect(raw).not.toContain("glucose");
    expect(raw).not.toContain("128");
    expect(raw).not.toContain("secret");
  });

  it("requestId 屬白名單，正常輸出（Web/Worker 貫穿欄位）", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("貫穿測試", { requestId: "req-2", path: "/api/health", httpStatus: 200 });
    const entry = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(entry.requestId).toBe("req-2");
    expect(entry.path).toBe("/api/health");
    expect(entry.redactedFieldCount).toBeUndefined();
  });
});
