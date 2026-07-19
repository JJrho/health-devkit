-- 0012_lethal_microbe 的回滾（E4-F3 PoC 2/2：regenerate 版本鏈）
ALTER TABLE "messages" DROP CONSTRAINT IF EXISTS "messages_regenerated_from_message_id_messages_id_fk";
ALTER TABLE "messages" DROP COLUMN IF EXISTS "regenerated_from_message_id";
