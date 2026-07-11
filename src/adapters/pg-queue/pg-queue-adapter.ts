import type { Pool } from "pg";
import type {
  ClaimedJob,
  EnqueueInput,
  QueueAdapter,
  QueueJobView,
} from "../queue-adapter";

/**
 * QueueAdapter 的 PostgreSQL 實作（C2）。
 * 認領以 FOR UPDATE SKIP LOCKED 確保多 Worker 併發安全；
 * 逾時回收（stale processing）與批次認領等強化，待 E2-F2 依實際負載演進。
 */
export class PgQueueAdapter implements QueueAdapter {
  constructor(private readonly pool: Pool) {}

  async enqueue(input: EnqueueInput): Promise<{ id: string }> {
    const result = await this.pool.query<{ id: string }>(
      `INSERT INTO queue_jobs (type, payload, max_retries, run_at)
       VALUES ($1, $2, COALESCE($3, 3), COALESCE($4, now()))
       RETURNING id`,
      [input.type, JSON.stringify(input.payload), input.maxRetries ?? null, input.runAt ?? null],
    );
    return { id: result.rows[0]!.id };
  }

  async claimNext(): Promise<ClaimedJob | null> {
    const result = await this.pool.query<{
      id: string;
      type: string;
      payload: Record<string, unknown>;
      retry_count: number;
    }>(
      `UPDATE queue_jobs
       SET status = 'processing', locked_at = now(), updated_at = now()
       WHERE id = (
         SELECT id FROM queue_jobs
         WHERE status = 'pending' AND run_at <= now()
         ORDER BY run_at
         FOR UPDATE SKIP LOCKED
         LIMIT 1
       )
       RETURNING id, type, payload, retry_count`,
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      payload: row.payload,
      retryCount: row.retry_count,
    };
  }

  async complete(jobId: string): Promise<void> {
    await this.pool.query(
      `UPDATE queue_jobs
       SET status = 'completed', locked_at = NULL, updated_at = now()
       WHERE id = $1 AND status = 'processing'`,
      [jobId],
    );
  }

  async fail(jobId: string, errorName: string): Promise<void> {
    // retry_count + 1 後未達 max_retries → 回 pending 重試；達上限 → failed
    await this.pool.query(
      `UPDATE queue_jobs
       SET retry_count = retry_count + 1,
           last_error_name = $2,
           status = CASE WHEN retry_count + 1 >= max_retries THEN 'failed' ELSE 'pending' END,
           locked_at = NULL,
           updated_at = now()
       WHERE id = $1 AND status = 'processing'`,
      [jobId, errorName],
    );
  }

  async getJob(jobId: string): Promise<QueueJobView | null> {
    const result = await this.pool.query<{
      id: string;
      type: string;
      status: QueueJobView["status"];
      retry_count: number;
      max_retries: number;
      last_error_name: string | null;
    }>(
      `SELECT id, type, status, retry_count, max_retries, last_error_name
       FROM queue_jobs WHERE id = $1`,
      [jobId],
    );
    const row = result.rows[0];
    if (!row) return null;
    return {
      id: row.id,
      type: row.type,
      status: row.status,
      retryCount: row.retry_count,
      maxRetries: row.max_retries,
      lastErrorName: row.last_error_name,
    };
  }
}
