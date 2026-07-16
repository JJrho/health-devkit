import "dotenv/config";
import { createClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";
import { DOCUMENTS_BUCKET } from "@/adapters/supabase-storage/supabase-storage-adapter";

/**
 * 一次性、冪等：建立私有 documents bucket（E2-F1，A18）。
 * 用法：pnpm exec tsx scripts/setup-storage.ts
 */
async function main(): Promise<void> {
  const client = createClient(
    requireEnv("SUPABASE_URL"),
    requireEnv("SUPABASE_SERVICE_ROLE_KEY"),
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const { data: buckets, error: listError } = await client.storage.listBuckets();
  if (listError) throw new Error(`列出 bucket 失敗：${listError.message}`);

  if (buckets.some((bucket) => bucket.name === DOCUMENTS_BUCKET)) {
    console.log(`✅ bucket "${DOCUMENTS_BUCKET}" 已存在，略過`);
    return;
  }

  const { error: createError } = await client.storage.createBucket(DOCUMENTS_BUCKET, {
    public: false,
    fileSizeLimit: "20MB", // C12
  });
  if (createError) throw new Error(`建立 bucket 失敗：${createError.message}`);
  console.log(`✅ 已建立私有 bucket "${DOCUMENTS_BUCKET}"`);
}

main().catch((error) => {
  console.error("setup-storage 失敗：", error instanceof Error ? error.message : error);
  process.exit(1);
});
