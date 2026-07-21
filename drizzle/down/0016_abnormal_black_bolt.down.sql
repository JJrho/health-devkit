-- 0016_abnormal_black_bolt 的回滾（E6-F1：稽核事件與刪除鏈模組）
ALTER TABLE "users" DROP COLUMN IF EXISTS "deletion_requested_at";
DROP TABLE IF EXISTS "audit_events";
