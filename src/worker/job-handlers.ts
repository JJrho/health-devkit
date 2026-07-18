import type { ClaimedJob } from "@/adapters";
import { getStorageAdapter } from "@/modules/documents";
import { runExtraction } from "@/modules/extraction";
import { standardizeDocument } from "@/modules/observations";

/**
 * 工作處理器註冊表。
 * Sprint 1 只有 PoC 用兩型：poc-echo（正常路徑）、poc-fail（失敗路徑）。
 * E2-F2 起在此註冊解析管線等正式處理器。
 */
export type JobHandler = (job: ClaimedJob) => Promise<void>;

export const jobHandlers: Record<string, JobHandler> = {
  "poc-echo": async () => {
    // 正常路徑：不做事，模擬成功
  },
  "poc-fail": async () => {
    throw new Error("PoC 失敗路徑模擬（AC-4）");
  },
  "parse-document": async (job) => {
    const documentId = job.payload.documentId;
    if (typeof documentId !== "string") throw new Error("payload 缺少 documentId");
    await runExtraction(getStorageAdapter(), documentId);
  },
  "standardize-document": async (job) => {
    const documentId = job.payload.documentId;
    if (typeof documentId !== "string") throw new Error("payload 缺少 documentId");
    await standardizeDocument(documentId);
  },
};
