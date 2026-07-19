import { and, desc, eq, gte, inArray, lt } from "drizzle-orm";
import type { LlmAdapter } from "@/adapters";
import { getDb } from "@/db/client";
import { conversations, messageCitations, messages, projects } from "@/db/schema";
import { logger } from "@/lib/logger";
import { findOwnedProject } from "@/modules/projects";
import { findOwnedConversation, type ConversationRow } from "./access";
import { validateAndExtractCitations } from "./citation-validation";
import { buildSystemPrompt } from "./prompt";
import { retrieveContext } from "./retrieval";
import { isContextInsufficient, scanForDiagnosticLanguage } from "./safety";

export type ConversationResult =
  | { ok: true; conversationId: string }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" };

export type ListConversationsResult =
  | { ok: true; conversations: ConversationRow[] }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" };

export type SendMessageResult =
  | { ok: true; messageId: string }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" | "RATE_LIMITED" };

export type RegenerateResult =
  | { ok: true; messageId: string }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" };

export interface MessageWithCitations {
  id: string;
  role: string;
  content: string | null;
  status: string;
  errorCode: string | null;
  createdAt: Date;
  citations: Array<{ citationType: string; citedText: string }>;
}

export type ListMessagesResult =
  | { ok: true; messages: MessageWithCitations[] }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" };

/** C17：每帳號每日問答上限（設定值），跨該帳號所有專案累計（A79） */
const DAILY_MESSAGE_LIMIT = 30;

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

/** PoC 2/2：對話列表，依 updatedAt 遞減、不分頁（A83） */
export async function listConversations(userId: string, projectId: string): Promise<ListConversationsResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const rows = await getDb()
    .select()
    .from(conversations)
    .where(eq(conversations.projectId, project.id))
    .orderBy(desc(conversations.updatedAt));
  return { ok: true, conversations: rows };
}

/**
 * PoC 2/2：對話訊息列表（供 UI 顯示歷史）。排除已被重新產生取代的舊版本
 * （被某則訊息的 regeneratedFromMessageId 指到的訊息），只回傳最新版本
 * （A78：UI 僅顯示最新版本），依時間正序供聊天視窗由上到下顯示。
 */
export async function listMessages(
  userId: string,
  projectId: string,
  conversationId: string,
): Promise<ListMessagesResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const conversation = await findOwnedConversation(userId, projectId, conversationId);
  if (!conversation) return { ok: false, code: "NOT_FOUND" };

  const allMessages = await getDb()
    .select()
    .from(messages)
    .where(eq(messages.conversationId, conversationId))
    .orderBy(messages.createdAt);

  const supersededIds = new Set(
    allMessages.filter((m) => m.regeneratedFromMessageId).map((m) => m.regeneratedFromMessageId!),
  );
  const visible = allMessages.filter((m) => !supersededIds.has(m.id));

  const citationRows =
    visible.length > 0
      ? await getDb()
          .select()
          .from(messageCitations)
          .where(inArray(messageCitations.messageId, visible.map((m) => m.id)))
      : [];

  const result: MessageWithCitations[] = visible.map((m) => ({
    id: m.id,
    role: m.role,
    content: m.content,
    status: m.status,
    errorCode: m.errorCode,
    createdAt: m.createdAt,
    citations: citationRows
      .filter((c) => c.messageId === m.id)
      .map((c) => ({ citationType: c.citationType, citedText: c.citedText })),
  }));

  return { ok: true, messages: result };
}

/** C17（A79）：跨該帳號所有專案，計算過去 24 小時內建立的使用者訊息數 */
async function countMessagesInLast24Hours(userId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const rows = await getDb()
    .select({ id: messages.id })
    .from(messages)
    .innerJoin(conversations, eq(messages.conversationId, conversations.id))
    .innerJoin(projects, eq(conversations.projectId, projects.id))
    .where(and(eq(projects.ownerId, userId), eq(messages.role, "user"), gte(messages.createdAt, since)));
  return rows.length;
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

  const recentCount = await countMessagesInLast24Hours(userId);
  if (recentCount >= DAILY_MESSAGE_LIMIT) {
    return { ok: false, code: "RATE_LIMITED" };
  }

  await getDb().insert(messages).values({ conversationId, role: "user", content, status: "completed" });
  const [assistantMessage] = await getDb()
    .insert(messages)
    .values({ conversationId, role: "assistant", status: "queued" })
    .returning();

  return { ok: true, messageId: assistantMessage!.id };
}

/**
 * PoC 2/2（A78）：重新產生——建立新版本訊息，regeneratedFromMessageId 指向
 * 被取代的舊訊息，不修改舊列內容（憲法 §4 原值永遠保留）。舊訊息須為
 * assistant 角色，任何已進入狀態機的狀態皆可重新產生（含 completed／failed／
 * cancelled／blocked，讓使用者對不滿意或失敗的回答都能重試）。
 */
export async function regenerateMessage(
  userId: string,
  projectId: string,
  oldMessageId: string,
): Promise<RegenerateResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const [oldMessage] = await getDb().select().from(messages).where(eq(messages.id, oldMessageId)).limit(1);
  if (!oldMessage || oldMessage.role !== "assistant") return { ok: false, code: "NOT_FOUND" };

  const conversation = await findOwnedConversation(userId, projectId, oldMessage.conversationId);
  if (!conversation) return { ok: false, code: "NOT_FOUND" };

  const [newMessage] = await getDb()
    .insert(messages)
    .values({
      conversationId: oldMessage.conversationId,
      role: "assistant",
      status: "queued",
      version: oldMessage.version + 1,
      regeneratedFromMessageId: oldMessageId,
    })
    .returning();

  return { ok: true, messageId: newMessage!.id };
}

/**
 * 找出某則 assistant 訊息實際要回答的使用者提問——沿 regeneratedFromMessageId
 * 回溯到最初（非重新產生）的那則訊息，再取該訊息之前最近一則 user 訊息
 * （多輪對話下，同一對話可能有多組一問一答，不可只抓對話的第一則訊息）。
 */
async function resolveQuestionText(message: typeof messages.$inferSelect): Promise<string> {
  let current = message;
  while (current.regeneratedFromMessageId) {
    const [prev] = await getDb()
      .select()
      .from(messages)
      .where(eq(messages.id, current.regeneratedFromMessageId))
      .limit(1);
    if (!prev) break;
    current = prev;
  }

  const [userMessage] = await getDb()
    .select()
    .from(messages)
    .where(
      and(
        eq(messages.conversationId, current.conversationId),
        eq(messages.role, "user"),
        lt(messages.createdAt, current.createdAt),
      ),
    )
    .orderBy(desc(messages.createdAt))
    .limit(1);
  return userMessage?.content ?? "";
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
  // 防禦：訊息已離開 queued（如重新整理頁面後重複呼叫 stream 端點），不重跑管線
  // 避免重複呼叫 LLM／重複寫入 message_citations（PoC 2/2 已知限制，見 DOR）
  if (message.status !== "queued") {
    if (message.status === "completed") yield { type: "stream_completed" };
    else if (message.status === "cancelled") yield { type: "stream_cancelled" };
    else yield { type: "stream_failed", errorCode: message.errorCode ?? "INTERNAL_ERROR" };
    return;
  }

  const questionText = await resolveQuestionText(message);

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
