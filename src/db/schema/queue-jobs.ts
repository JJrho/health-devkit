import {
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

/**
 * queue_jobs — PG queue PoC 表（A3：PoC 級結構，E2-F2 依解析管線需求走 migration 演進）。
 * 命名 snake_case（憲法 §2）；timestamptz（憲法 §4）。
 * last_error_name 只存錯誤類別名，不存訊息內容（憲法 §4 日誌與內容規則之延伸）。
 */
export const queueJobs = pgTable(
  "queue_jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    type: text("type").notNull(),
    payload: jsonb("payload").notNull().default({}),
    status: text("status", {
      enum: ["pending", "processing", "completed", "failed"],
    })
      .notNull()
      .default("pending"),
    retryCount: integer("retry_count").notNull().default(0),
    maxRetries: integer("max_retries").notNull().default(3),
    runAt: timestamp("run_at", { withTimezone: true }).notNull().defaultNow(),
    lockedAt: timestamp("locked_at", { withTimezone: true }),
    lastErrorName: text("last_error_name"),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (table) => [index("queue_jobs_status_run_at_idx").on(table.status, table.runAt)],
);
