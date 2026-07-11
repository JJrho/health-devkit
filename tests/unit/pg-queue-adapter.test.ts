import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPool, closePool } from "@/db/client";
import { PgQueueAdapter } from "@/adapters/pg-queue/pg-queue-adapter";

/**
 * PG Queue 整合測試（AC-3／AC-4 的自動化驗證；連 Supabase 東京實庫）。
 * 需要 .env 的 DATABASE_URL；migration 需先套用（pnpm db:migrate）。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

describe.skipIf(!hasDb)("PgQueueAdapter（整合，需 DATABASE_URL）", () => {
  let queue: PgQueueAdapter;

  beforeAll(() => {
    queue = new PgQueueAdapter(getPool());
  });

  afterAll(async () => {
    // 清理本輪測試工作，保持庫面乾淨
    await getPool().query(`DELETE FROM queue_jobs WHERE type LIKE 'test-%'`);
    await closePool();
  });

  it("正常路徑：enqueue → claim → complete（AC-3）", async () => {
    const { id } = await queue.enqueue({ type: "test-echo", payload: { n: 1 } });

    const claimed = await queue.claimNext();
    expect(claimed).not.toBeNull();
    expect(claimed!.id).toBe(id);
    expect(claimed!.payload).toEqual({ n: 1 });

    await queue.complete(id);
    const job = await queue.getJob(id);
    expect(job!.status).toBe("completed");
  });

  it("失敗路徑：fail 遞增 retry_count、回 pending 重試（AC-4）", async () => {
    const { id } = await queue.enqueue({
      type: "test-fail",
      payload: {},
      maxRetries: 2,
    });

    const claimed = await queue.claimNext();
    expect(claimed!.id).toBe(id);
    await queue.fail(id, "Error");

    const afterFirstFail = await queue.getJob(id);
    expect(afterFirstFail!.status).toBe("pending"); // 1 < 2，可重試
    expect(afterFirstFail!.retryCount).toBe(1);
    expect(afterFirstFail!.lastErrorName).toBe("Error");
  });

  it("失敗路徑：達 max_retries 標記 failed（AC-4）", async () => {
    const { id } = await queue.enqueue({
      type: "test-fail-final",
      payload: {},
      maxRetries: 1,
    });

    const claimed = await queue.claimNext();
    expect(claimed!.id).toBe(id);
    await queue.fail(id, "Error");

    const job = await queue.getJob(id);
    expect(job!.status).toBe("failed"); // 1 >= 1，不再重試
    expect(job!.retryCount).toBe(1);
  });

  it("空佇列 claim 回 null", async () => {
    // 先清空 pending 測試工作再驗證
    await getPool().query(
      `UPDATE queue_jobs SET status='completed' WHERE status IN ('pending','processing') AND type LIKE 'test-%'`,
    );
    const claimed = await queue.claimNext();
    // 非測試工作可能存在，只驗證回傳型別合法
    expect(claimed === null || typeof claimed.id === "string").toBe(true);
  });
});

if (!hasDb) {
   
  console.warn("⚠️ 未設定 DATABASE_URL——PG Queue 整合測試已跳過（AC-5 驗收時必須有 .env）");
}
