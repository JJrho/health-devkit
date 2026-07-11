/**
 * LlmAdapter 介面（憲法 §1、§3）。
 * 憲法 §3：所有 LLM 輸出必須 Streaming（SSE）——因此本介面「只有」串流方法，
 * 不提供非串流補全，從介面層面杜絕違憲實作。
 * Sprint 1 僅定義介面；OpenAI Responses API 實作於 E4-F3（串流問答引擎）。
 */
export interface LlmAdapter {
  /** 串流產生回答；回傳 token 片段之 AsyncIterable */
  streamCompletion(request: LlmStreamRequest): AsyncIterable<LlmStreamChunk>;
}

export interface LlmStreamRequest {
  systemPrompt: string;
  messages: Array<{ role: "user" | "assistant"; content: string }>;
  /** token 預算為設定值（C16） */
  maxOutputTokens: number;
  abortSignal?: AbortSignal;
}

export type LlmStreamChunk =
  | { type: "text"; delta: string }
  | { type: "done"; finishReason: "stop" | "cancelled" | "length" };
