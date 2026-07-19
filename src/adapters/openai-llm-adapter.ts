import OpenAI from "openai";
import type { LlmAdapter, LlmStreamChunk, LlmStreamRequest } from "./llm-adapter";

/**
 * LlmAdapter 的 OpenAI Responses API 實作（E4-F3 PoC 1/2；技術選型 §11.2）。
 * 僅實作既有介面的串流方法，不提供非串流補全（憲法 §3 由介面層面已排除）。
 */
export class OpenAiLlmAdapter implements LlmAdapter {
  private readonly client: OpenAI;
  private readonly model: string;

  constructor(apiKey: string, model = "gpt-4o-mini") {
    this.client = new OpenAI({ apiKey });
    this.model = model;
  }

  async *streamCompletion(request: LlmStreamRequest): AsyncIterable<LlmStreamChunk> {
    try {
      const stream = await this.client.responses.create(
        {
          model: this.model,
          instructions: request.systemPrompt,
          input: request.messages.map((m) => ({ role: m.role, content: m.content })),
          max_output_tokens: request.maxOutputTokens,
          stream: true,
        },
        { signal: request.abortSignal },
      );

      for await (const event of stream) {
        if (event.type === "response.output_text.delta") {
          yield { type: "text", delta: event.delta };
        } else if (event.type === "response.completed") {
          yield { type: "done", finishReason: "stop" };
          return;
        } else if (event.type === "response.incomplete") {
          const reason = event.response.incomplete_details?.reason;
          yield { type: "done", finishReason: reason === "max_output_tokens" ? "length" : "stop" };
          return;
        }
      }
    } catch (err) {
      // 取消透過 AbortSignal 觸發，OpenAI SDK 會拋出 AbortError（上游「取消後停止模型工作」）
      if (request.abortSignal?.aborted) {
        yield { type: "done", finishReason: "cancelled" };
        return;
      }
      throw err;
    }
  }
}
