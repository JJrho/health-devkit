import "dotenv/config";
import { readFile } from "node:fs/promises";
import { basename } from "node:path";
import { requireEnv } from "@/lib/env";
import {
  deleteFile,
  getAccessToken,
  listFilesInFolder,
  uploadFile,
  type ServiceAccountKey,
} from "./google-drive";

/**
 * E8-F1：上傳備份檔至 Google Drive，並清除超過 RETENTION_DAYS 天的舊備份
 * （A157：依檔名內嵌日期判斷，非 Drive createdTime）。
 * 用法：pnpm exec tsx scripts/backup/upload-to-drive.ts <file1> <file2> ...
 */
const RETENTION_DAYS = 14;
const DATE_IN_FILENAME = /(\d{4}-\d{2}-\d{2})/;

function mimeTypeFor(filename: string): string {
  if (filename.endsWith(".zip")) return "application/zip";
  if (filename.endsWith(".sql")) return "application/sql";
  return "application/octet-stream";
}

async function main(): Promise<void> {
  const filePaths = process.argv.slice(2);
  if (filePaths.length === 0) {
    throw new Error("用法：pnpm exec tsx scripts/backup/upload-to-drive.ts <file1> <file2> ...");
  }

  const key = JSON.parse(requireEnv("GOOGLE_SERVICE_ACCOUNT_JSON")) as ServiceAccountKey;
  const folderId = requireEnv("GOOGLE_DRIVE_FOLDER_ID");
  const accessToken = await getAccessToken(key);

  for (const filePath of filePaths) {
    const filename = basename(filePath);
    const content = await readFile(filePath);
    const fileId = await uploadFile(accessToken, folderId, filename, mimeTypeFor(filename), content);
    console.log(`已上傳 ${filename}（${content.byteLength} bytes，Drive id ${fileId}）`);
  }

  const existing = await listFilesInFolder(accessToken, folderId);
  const cutoff = new Date();
  cutoff.setUTCDate(cutoff.getUTCDate() - RETENTION_DAYS);

  let deleted = 0;
  for (const file of existing) {
    const match = file.name.match(DATE_IN_FILENAME);
    if (!match) {
      console.warn(`檔名無法解析日期，略過清理判斷：${file.name}`);
      continue;
    }
    const fileDate = new Date(`${match[1]}T00:00:00Z`);
    if (fileDate < cutoff) {
      await deleteFile(accessToken, file.id);
      console.log(`已清除超過 ${RETENTION_DAYS} 天的舊備份：${file.name}`);
      deleted += 1;
    }
  }
  console.log(`清理完成，共刪除 ${deleted} 個舊檔案，資料夾現有 ${existing.length - deleted} 個檔案`);
}

main().catch((error) => {
  console.error("upload-to-drive 失敗：", error instanceof Error ? error.message : error);
  process.exit(1);
});
