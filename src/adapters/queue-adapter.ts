/**
 * QueueAdapter 介面（憲法 §1；C2：第一版 PostgreSQL queue，保留 Redis 升級路徑）。
 * Sprint 1 交付 PG 實作（pg-queue/）＋長駐 Worker（src/worker/）。
 */
export interface QueueAdapter {
  /** 排入工作；冪等由呼叫端以業務鍵控制（憲法 §4 idempotency 於各 Feature 落地） */
  enqueue(input: EnqueueInput): Promise<{ id: string }>;
  /** 認領下一筆待執行工作（併發安全）；無工作回 null */
  claimNext(): Promise<ClaimedJob | null>;
  /** 標記完成 */
  complete(jobId: string): Promise<void>;
  /**
   * 標記失敗：retry_count 遞增；未達 max_retries 回到待執行，達上限標記 failed。
   * errorName 只記錯誤類別名（憲法 §4：內容不入日誌／不入表）。
   */
  fail(jobId: string, errorName: string): Promise<void>;
  /** 查單筆狀態（測試與驗收用） */
  getJob(jobId: string): Promise<QueueJobView | null>;
}

export interface EnqueueInput {
  type: string;
  payload: Record<string, unknown>;
  maxRetries?: number;
  runAt?: Date;
}

export interface ClaimedJob {
  id: string;
  type: string;
  payload: Record<string, unknown>;
  retryCount: number;
}

export interface QueueJobView {
  id: string;
  type: string;
  status: "pending" | "processing" | "completed" | "failed";
  retryCount: number;
  maxRetries: number;
  lastErrorName: string | null;
}
