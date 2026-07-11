import "dotenv/config";
import { getPool, closePool } from "@/db/client";
import { PgQueueAdapter } from "@/adapters/pg-queue/pg-queue-adapter";

/**
 * AC-3／AC-4 現場驗證：enqueue 正常與失敗工作，輪詢等 Worker 處理。
 * 前提：pnpm worker 已在另一進程執行。
 */
async function main(): Promise<void> {
  const queue = new PgQueueAdapter(getPool());

  const echo = await queue.enqueue({ type: "poc-echo", payload: { demo: true } });
  const fail = await queue.enqueue({ type: "poc-fail", payload: {}, maxRetries: 2 });
   
  console.log("enqueued: echo + fail");

  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    const [echoJob, failJob] = await Promise.all([
      queue.getJob(echo.id),
      queue.getJob(fail.id),
    ]);
    if (echoJob?.status === "completed" && failJob?.status === "failed") {
       
      console.log(
        `RESULT echo=${echoJob.status} fail=${failJob.status} retries=${failJob.retryCount}/${failJob.maxRetries} lastError=${failJob.lastErrorName}`,
      );
      await closePool();
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  const [echoJob, failJob] = await Promise.all([
    queue.getJob(echo.id),
    queue.getJob(fail.id),
  ]);
   
  console.log(
    `TIMEOUT echo=${echoJob?.status} fail=${failJob?.status} retries=${failJob?.retryCount}`,
  );
  await closePool();
  process.exit(1);
}

main().catch((error) => {
   
  console.error("demo 失敗：", error instanceof Error ? error.message : error);
  process.exit(1);
});
