import { describe, expect, it, vi, afterEach } from "vitest";
import { logger } from "@/lib/logger";

/**
 * 憲法 §4：日誌白名單欄位機制驗證。
 * logger 介面只接受 SafeFields——本測試確認輸出為結構化 JSON 且僅含白名單鍵。
 */
describe("logger（日誌白名單）", () => {
  afterEach(() => vi.restoreAllMocks());

  it("輸出結構化 JSON，僅含白名單欄位", () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    logger.info("工作完成", { jobId: "abc", jobType: "poc-echo", durationMs: 5 });

    expect(spy).toHaveBeenCalledOnce();
    const entry = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(entry).toMatchObject({
      level: "info",
      message: "工作完成",
      jobId: "abc",
      jobType: "poc-echo",
      durationMs: 5,
    });
    // 不得出現 payload 之類的自由欄位
    expect(Object.keys(entry).sort()).toEqual(
      ["durationMs", "jobId", "jobType", "level", "message", "time"].sort(),
    );
  });

  it("error 等級走 console.error", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    logger.error("工作失敗", { errorName: "Error" });
    expect(spy).toHaveBeenCalledOnce();
    const entry = JSON.parse(spy.mock.calls[0]![0] as string);
    expect(entry.level).toBe("error");
    expect(entry.errorName).toBe("Error");
  });
});
