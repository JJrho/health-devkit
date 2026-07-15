-- 0002_chilly_chat 的回滾（E1-F4 健康專案表＋RLS 政策）
DROP POLICY IF EXISTS "projects_owner_only" ON "projects";
--> statement-breakpoint
DROP TABLE IF EXISTS "projects";
