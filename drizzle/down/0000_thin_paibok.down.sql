-- 0000_thin_paibok 的回滾（AC-1：migration 可回滾）
DROP INDEX IF EXISTS "queue_jobs_status_run_at_idx";
--> statement-breakpoint
DROP TABLE IF EXISTS "queue_jobs";
--> statement-breakpoint
DROP EXTENSION IF EXISTS vector;
