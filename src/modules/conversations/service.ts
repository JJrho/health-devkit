import { eq } from "drizzle-orm";
import type { LlmAdapter } from "@/adapters";
import { getDb } from "@/db/client";
import { conversations, messageCitations, messages } from "@/db/schema";
import { logger } from "@/lib/logger";
import { findOwnedProject } from "@/modules/projects";
import { findOwnedConversation } from "./access";
import { validateAndExtractCitations } from "./citation-validation";
import { buildSystemPrompt } from "./prompt";
import { retrieveContext } from "./retrieval";
import { isContextInsufficient, scanForDiagnosticLanguage } from "./safety";

export type ConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" };

export type SendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" };

export type SseEvent =
  | { type: "stream_started" }
  | { type: "retrieval_completed"; observationCount: number; knowledgeChunkCount: number }
  | { type: "content_delta"; delta: string }
  | { type: "citation_added"; citationType: string; targetId: string }
  | { type: "safety_notice"; code: string }
  | { type: "stream_completed" }
  | { type: "stream_cancelled" }
  | { type: "stream_failed"; errorCode: string };

/** 進行中串流的取消控制（單一 Node process 常駐 Worker 之外的 web service 內存狀態，PoC 範圍） */
const activeStreams = new Map<string, AbortController>();

/** C16：token 預算的簡化落地——上限筆數，避免單次呼叫過度膨脹（PoC 設定值） */
const MAX_OUTPUT_TOKENS = 2000;

export async function createConversation(userId: string, projectId: string): Promise<ConversationResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const [row] = await getDb().insert(conversations).values({ projectId: project.id }).returning();
  return { ok: true, conversationId: row!.id };
}

export async function sendMessage(
  userId: string,
  projectId: string,
  conversationId: string,
  content: string,
): Promise<SendMessageResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const conversation = await findOwnedConversation(userId, projectId, conversationId);
  if (!conversation) return { ok: false, code: "NOT_FOUND" };

  await getDb().insert(messages).values({ conversationId, role: "user", content, status: "completed" });
  const [assistantMessage] = await getDb()
    .insert(messages)
    .values({ conversationId, role: "assistant", status: "queued" })
    .returning();

  return { ok: true, messageId: assistantMessage!.id };
}

/**
 * E4-F3 核心管線（上游 §18.2 狀態機；A70）：
 * queued → retrieving_sources → safety_check → streaming → completed
 * 任一階段可轉 blocked／failed；streaming → cancelled。
 */
export async function* runAssistantMessage(
  messageId: string,
  projectId: string,
  llmAdapter: LlmAdapter,
): AsyncGenerator<SseEvent> {
  const [message] = await getDb().select().from(messages).where(eq(messages.id, messageId)).limit(1);
  if (!message || message.role !== "assistant") {
    yield { type: "stream_failed", errorCode: "INTERNAL_ERROR" };
    return;
  }

  const [userMessage] = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, message.conversationId))
    .orderBy(messages.createdAt)
    .limit(1);
  const questionText = userMessage?.content ?? "";

  yield { type: "stream_started" };
  await setStatus(messageId, "retrieving_sources");

  const context = await retrieveContext(projectId, questionText);
  yield {
    type: "retrieval_completed",
    observationCount: context.observations.length,
    knowledgeChunkCount: context.knowledgeChunks.length,
  };

  await setStatus(messageId, "safety_check");
  if (isContextInsufficient(context)) {
    await setStatus(messageId, "blocked", "AI_INSUFFICIENT_DATA");
    yield { type: "safety_notice", code: "AI_INSUFFICIENT_DATA" };
    yield { type: "stream_failed", errorCode: "AI_INSUFFICIENT_DATA" };
    return;
  }

  const systemPrompt = buildSystemPrompt(context);
  const providedObservationIds = new Set(context.observations.map((o) => o.observationId));
  const providedChunkIds = new Set(context.knowledgeChunks.map((c) => c.chunkId));

  const abortController = new AbortController();
  activeStreams.set(messageId, abortController);
  await setStatus(messageId, "streaming");

  let rawContent = "";
  try {
    for await (const chunk of llmAdapter.streamCompletion({
      systemPrompt,
      messages: [{ role: "user", content: questionText }],
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      abortSignal: abortController.signal,
    })) {
      if (chunk.type === "text") {
        rawContent += chunk.delta;
        yield { type: "content_delta", delta: chunk.delta };
      } else if (chunk.finishReason === "cancelled") {
        await setStatus(messageId, "cancelled");
        yield { type: "stream_cancelled" };
        return;
      }
    }
  } catch (err) {
    logger.error("AI 串流失敗", { errorName: err instanceof Error ? err.name : "Unknown" });
    await setStatus(messageId, "failed", "INTERNAL_ERROR");
    yield { type: "stream_failed", errorCode: "INTERNAL_ERROR" };
    return;
  } finally {
    activeStreams.delete(messageId);
  }

  if (scanForDiagnosticLanguage(rawContent)) {
    yield { type: "safety_notice", code: "DIAGNOSTIC_LANGUAGE_DETECTED" };
  }

  const { cleanedContent, citations } = await validateAndExtractCitations(
    rawContent,
    projectId,
    providedObservationIds,
    providedChunkIds,
  );

  for (const citation of citations) {
    await getDb()
      .insert(messageCitations)
      .values({
        messageId,
        citationType: citation.citationType,
        observationId: citation.observationId,
        knowledgeChunkId: citation.knowledgeChunkId,
        citedText: citation.citedText,
      });
    yield {
      type: "citation_added",
      citationType: citation.citationType,
      targetId: citation.observationId ?? citation.knowledgeChunkId ?? "",
    };
  }

  await getDb()
    .update(messages)
    .set({ content: cleanedContent, status: "completed", updatedAt: new Date() })
    .where(eq(messages.id, messageId));
  yield { type: "stream_completed" };
}

export function cancelMessage(messageId: string): boolean {
  const controller = activeStreams.get(messageId);
  if (!controller) return false;
  controller.abort();
  return true;
}

async function setStatus(messageId: string, status: string, errorCode?: string): Promise<void> {
  await getDb()
    .update(messages)
    .set({ status, errorCode: errorCode ?? null, updatedAt: new Date() })
    .where(eq(messages.id, messageId));
}
