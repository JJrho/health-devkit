-- 0008_lethal_king_bedlam 的回滾（E3-F2 趨勢圖與等價資料表，A45/A46 欄位補齊）
ALTER TABLE "documents" DROP COLUMN IF EXISTS "report_date";
ALTER TABLE "observations" DROP COLUMN IF EXISTS "raw_reference_range";
