import "dotenv/config";
import { getPool, closePool } from "@/db/client";
import { PgQueueAdapter } from "@/adapters/pg-queue/pg-queue-adapter";
import { logger } from "@/lib/logger";
import { jobHandlers } from "./job-handlers";

/**
 * 長駐 Worker（C1：與 Web 同 codebase、Zeabur 另開 service 部署——Sprint 2）。
 * 輪詢認領 → 執行處理器 → complete／fail。
 * 憲法 §4：日誌僅記白名單欄位（jobId/type/status），payload 一律不落地。
 */
const POLL_INTERVAL_MS = 1000;
let running = true;

async function tick(queue: PgQueueAdapter): Promise<void> {
  const job = await queue.claimNext();
  if (!job) return;

  // 每次工作執行一個 requestId，與 Web 端日誌同欄位貫穿（Sprint 2 AC-5）
  const requestId = crypto.randomUUID();
  const startedAt = Date.now();
  const handler = jobHandlers[job.type];

  if (!handler) {
    await queue.fail(job.id, "UnknownJobType");
    logger.warn("未註冊的工作類型", { requestId, jobId: job.id, jobType: job.type });
    return;
  }

  try {
    await handler(job);
    await queue.complete(job.id);
    logger.info("工作完成", {
      requestId,
      jobId: job.id,
      jobType: job.type,
      status: "completed",
      durationMs: Date.now() - startedAt,
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
    await queue.fail(job.id, errorName);
    logger.error("工作失敗", {
      requestId,
      jobId: job.id,
      jobType: job.type,
      status: "failed-or-retrying",
      retryCount: job.retryCount + 1,
      errorName,
    });
  }
}

async function main(): Promise<void> {
  const queue = new PgQueueAdapter(getPool());
  logger.info("Worker 啟動", { status: "started" });

  while (running) {
    try {
      await tick(queue);
    } catch (error) {
      // tick 自身出錯（如 DB 斷線）不可讓 Worker 崩潰（AC-4）
      const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
      logger.error("輪詢例外，續行", { errorName });
    }
    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
  }

  await closePool();
  logger.info("Worker 已停止", { status: "stopped" });
}

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    running = false;
  });
}

void main();
