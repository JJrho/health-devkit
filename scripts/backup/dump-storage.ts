import "dotenv/config";
import { createWriteStream } from "node:fs";
import archiver from "archiver";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { requireEnv } from "@/lib/env";

/**
 * E8-F1（A154）：Storage 全量備份——直接呼叫 Supabase client（比照既有
 * scripts/setup-storage.ts 慣例），非透過 app 的 StorageAdapter（該介面
 * 本無 list 能力，且本腳本屬 CI 維運層級，非 app 執行期領域邏輯）。
 * 用法：pnpm exec tsx scripts/backup/dump-storage.ts <輸出zip路徑>
 */

interface StorageFile {
  bucket: string;
  path: string;
}

async function listAllFiles(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: SupabaseClient<any>,
  bucket: string,
  prefix: string,
): Promise<StorageFile[]> {
  const { data, error } = await client.storage.from(bucket).list(prefix, { limit: 1000 });
  if (error) throw new Error(`列出 ${bucket}/${prefix} 失敗：${error.message}`);

  const files: StorageFile[] = [];
  for (const entry of data ?? []) {
    const fullPath = prefix ? `${prefix}/${entry.name}` : entry.name;
    // Supabase Storage：資料夾項目 id 為 null，檔案項目 id 非 null
    if (entry.id === null) {
      files.push(...(await listAllFiles(client, bucket, fullPath)));
    } else {
      files.push({ bucket, path: fullPath });
    }
  }
  return files;
}

async function main(): Promise<void> {
  const outputPath = process.argv[2];
  if (!outputPath) {
    throw new Error("用法：pnpm exec tsx scripts/backup/dump-storage.ts <輸出zip路徑>");
  }

  const client = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: buckets, error: bucketsError } = await client.storage.listBuckets();
  if (bucketsError) throw new Error(`列出 bucket 失敗：${bucketsError.message}`);

  const allFiles: StorageFile[] = [];
  for (const bucket of buckets ?? []) {
    allFiles.push(...(await listAllFiles(client, bucket.name, "")));
  }
  console.log(`共 ${buckets?.length ?? 0} 個 bucket，${allFiles.length} 個物件`);

  const output = createWriteStream(outputPath);
  const archive = archiver("zip", { zlib: { level: 9 } });
  const done = new Promise<void>((resolve, reject) => {
    output.on("close", resolve);
    archive.on("error", reject);
  });
  archive.pipe(output);

  let failures = 0;
  for (const file of allFiles) {
    const { data, error } = await client.storage.from(file.bucket).download(file.path);
    if (error || !data) {
      // 誠實失敗：下載失敗不可靜默略過，計入失敗數並在結尾讓整個腳本以非零結束
      console.error(`下載失敗 ${file.bucket}/${file.path}：${error?.message ?? "無資料"}`);
      failures += 1;
      continue;
    }
    const buffer = Buffer.from(await data.arrayBuffer());
    archive.append(buffer, { name: `${file.bucket}/${file.path}` });
  }

  await archive.finalize();
  await done;

  console.log(`已寫入 ${outputPath}（${allFiles.length - failures}/${allFiles.length} 個物件成功）`);
  if (failures > 0) {
    throw new Error(`${failures} 個物件下載失敗，備份不完整`);
  }
}

main().catch((error) => {
  console.error("dump-storage 失敗：", error instanceof Error ? error.message : error);
  process.exit(1);
});
