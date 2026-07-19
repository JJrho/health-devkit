import type { LlmAdapter } from "@/adapters";
import { OpenAiLlmAdapter } from "@/adapters/openai-llm-adapter";
import { requireEnv } from "@/lib/env";

let llm: LlmAdapter | undefined;

/** conversations 模組組裝點：正式環境的 LlmAdapter 單例（OpenAI Responses API，A68） */
export function getLlmAdapter(): LlmAdapter {
  if (!llm) {
    llm = new OpenAiLlmAdapter(requireEnv("OPENAI_API_KEY"));
  }
  return llm;
}

export { findOwnedConversation } from "./access";
export type { ConversationRow } from "./access";
export { createConversation, sendMessage, runAssistantMessage, cancelMessage } from "./service";
export type { ConversationResult, SendMessageResult, SseEvent } from "./service";
export { validateAndExtractCitations } from "./citation-validation";
export { retrieveContext } from "./retrieval";
export { buildSystemPrompt } from "./prompt";
export { isContextInsufficient, scanForDiagnosticLanguage } from "./safety";
