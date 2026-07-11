/**
 * Adapter 介面群總出口（憲法 §1：外部服務一律經 Adapter）。
 * 領域模組只准從這裡 import 介面；實作的組裝（wiring）集中於各執行進入點。
 */
export type { AuthAdapter, AuthUser } from "./auth-adapter";
export type { StorageAdapter } from "./storage-adapter";
export type { OcrAdapter, OcrPageResult } from "./ocr-adapter";
export type { LlmAdapter, LlmStreamRequest, LlmStreamChunk } from "./llm-adapter";
export type {
  QueueAdapter,
  EnqueueInput,
  ClaimedJob,
  QueueJobView,
} from "./queue-adapter";
