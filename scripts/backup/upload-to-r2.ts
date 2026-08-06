import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  DeleteObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { requireEnv } from "@/lib/env";

/**
 * E8-F1：上傳備份檔至 Cloudflare R2，並清除超過 RETENTION_DAYS 天的舊備份
 * （A157：依檔名內嵌日期判斷，非物件的 LastModified）。
 * R2 為 S3 相容 API（Cloudflare 官方建議走法，見 09_KNOWLEDGE_BASE.md
 * 目的地變更記錄）——原設計走 Google Drive service account 上傳，
 * 正式站部署驗收時撞上 Google 平台限制（service account 對個人 Gmail
 * Drive 沒有儲存配額，見同一筆記錄），改走 R2。
 * 用法：pnpm exec tsx scripts/backup/upload-to-r2.ts <file1> <file2> ...
 */
const RETENTION_DAYS = 14;
const DATE_IN_FILENAME = /(\d{4}-\d{2}-\d{2})/;

function contentTypeFor(filename: string): string {
  if (filename.endsWith(".zip")) return "application/zip";
  if (filename.endsWith(".sql")) return "application/sql";
  return "application/octet-stream";
}

function buildClient(): S3Client {
  const accountId = requireEnv("CLOUDFLARE_ACCOUNT_ID");
  return new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId: requireEnv("R2_ACCESS_KEY_ID"),
      secretAccessKey: requireEnv("R2_SECRET_ACCESS_KEY"),
    },
  });
}

async function main(): Promise<void> {
  const filePaths = process.argv.slice(2);
  if (filePaths.length === 0) {
    throw new Error("用法：pnpm exec tsx scripts/backup/upload-to-r2.ts <file1> <file2> ...");
  }

  const bucket = requireEnv("R2_BUCKET_NAME");
  const client = buildClient();

  for (const filePath of filePaths) {
    const filename = basename(filePath);
    const content = await readFile(filePath);
    await client.send(
      new PutObjectCommand({
        Bucket: bucket,
        Key: filename,
        Body: content,
        ContentType: contentTypeFor(filename),
      }),
    );
    console.log(`已上傳 ${filename}（${content.byteLength} bytes）`);
  }

  const listed = await client.send(new ListObjectsV2Command({ Bucket: bucket }));
  const existing = listed.Contents ?? [];
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  let deleted = 0;
  for (const object of existing) {
    const key = object.Key;
    if (!key) continue;
    const match = key.match(DATE_IN_FILENAME);
    if (!match) {
      console.warn(`檔名無法解析日期，略過清理判斷：${key}`);
      continue;
    }
    const fileDate = new Date(`${match[1]}T00:00:00Z`);
    if (fileDate < cutoff) {
      await client.send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
      console.log(`已清除超過 ${RETENTION_DAYS} 天的舊備份：${key}`);
      deleted += 1;
    }
  }
  console.log(`清理完成，共刪除 ${deleted} 個舊檔案，bucket 現有 ${existing.length - deleted} 個檔案`);
}

main().catch((error) => {
  console.error("upload-to-r2 失敗：", error instanceof Error ? error.message : error);
  process.exit(1);
});
