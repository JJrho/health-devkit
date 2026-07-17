import { describe, expect, it } from "vitest";
import { TimeoutError, withTimeout } from "@/lib/with-timeout";

/** KB-022：逐工作逾時防線的核心機制單元測試 */
describe("withTimeout", () => {
  it("正常在時限內完成的 promise 照常回傳結果", async () => {
    const result = await withTimeout(Promise.resolve("done"), 100);
    expect(result).toBe("done");
  });

  it("超過時限視同失敗（TimeoutError），不等待原 promise", async () => {
    const neverResolves = new Promise(() => {}); // 模擬卡死／病態輸入
    await expect(withTimeout(neverResolves, 50)).rejects.toBeInstanceOf(TimeoutError);
  });

  it("原 promise 本身拋出的錯誤正常傳遞（不被逾時機制吃掉）", async () => {
    const failing = Promise.reject(new Error("原本的錯誤"));
    await expect(withTimeout(failing, 100)).rejects.toThrow("原本的錯誤");
  });
});
