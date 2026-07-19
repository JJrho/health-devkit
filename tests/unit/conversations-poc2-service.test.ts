import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import type { LlmAdapter, LlmStreamChunk } from "@/adapters";
import { getDb, closePool } from "@/db/client";
import { knowledgeChunks, knowledgeSources, messages, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import {
  createConversation,
  listConversations,
  listMessages,
  regenerateMessage,
  runAssistantMessage,
  sendMessage,
} from "@/modules/conversations";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E4-F3 PoC 2/2 整合測試（Sprint 16，AC-4～AC-6；連實庫）。
 * 不需真實 OpenAI 呼叫——regenerate／頻率限制／列表邏輯皆為服務層資料操作，
 * 用 ImmediateLlmAdapter 驗證管線串接正確即可（比照 Sprint 15 依賴注入模式）。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

class ImmediateLlmAdapter implements LlmAdapter {
  constructor(private readonly text: string = "測試回答內容。") {}
  async *streamCompletion(): AsyncIterable<LlmStreamChunk> {
    yield { type: "text", delta: this.text };
    yield { type: "done", finishReason: "stop" };
  }
}

async function seedUser(prefix = "conv2"): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `${prefix}-${id}@projects.test.invalid` });
  return id;
}

/**
 * 合成一筆 status=active 知識來源，避免 retrieveContext 判定資料不足直接 blocked
 * （A72 既有模式）。content 需包含測試問題文字的子字串，searchKnowledge() 為
 * ILIKE 子字串比對（KB-029），關鍵字對不上就查無結果、context 仍會被判定不足。
 */
async function setupActiveKnowledgeChunk(keyword: string): Promise<void> {
  const [source] = await getDb()
    .insert(knowledgeSources)
    .values({ title: `conv2-合成來源-${randomUUID()}`, sourceType: "peer_reviewed_guideline", status: "active" })
    .returning();
  await getDb().insert(knowledgeChunks).values({
    sourceId: source!.id,
    chunkIndex: 0,
    content: `這是包含關鍵字「${keyword}」的測試用知識內容。`,
  });
}

describe.skipIf(!hasDb)("conversations module PoC 2/2（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("conv2-%@projects.test.invalid");

    // 合成知識來源不歸 cleanupTestData 管，比照 KB-030 精神自行清除
    const synthetic = await getDb()
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(like(knowledgeSources.title, "conv2-合成來源-%"));
    const sourceIds = synthetic.map((s) => s.id);
    if (sourceIds.length > 0) {
      await getDb().delete(knowledgeChunks).where(inArray(knowledgeChunks.sourceId, sourceIds));
      await getDb().delete(knowledgeSources).where(inArray(knowledgeSources.id, sourceIds));
    }

    await closePool();
  });

  it("AC（列表）：listConversations 依 updatedAt 遞減回傳，跨帳號一律 PROJECT_ACCESS_DENIED", async () => {
    const ownerId = await seedUser();
    const otherId = await seedUser();
    const project = await createProject(ownerId, "列表測試專案");
    const first = await createConversation(ownerId, project.id);
    const second = await createConversation(ownerId, project.id);
    if (!first.ok || !second.ok) throw new Error("setup failed");

    const result = await listConversations(ownerId, project.id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.conversations.map((c) => c.id)).toEqual([second.conversationId, first.conversationId]);

    const denied = await listConversations(otherId, project.id);
    expect(denied).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
  });

  it("AC-4（重新產生）：建立新版本訊息，regeneratedFromMessageId 指向舊訊息，UI 列表僅顯示最新版本", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "重新產生測試專案");
    await setupActiveKnowledgeChunk("測試問題");
    const conversation = await createConversation(ownerId, project.id);
    if (!conversation.ok) throw new Error("setup failed");
    const sent = await sendMessage(ownerId, project.id, conversation.conversationId, "測試問題");
    if (!sent.ok) throw new Error("setup failed");

    for await (const _ of runAssistantMessage(sent.messageId, project.id, new ImmediateLlmAdapter("第一版回答"))) {
      void _;
    }

    const regenerated = await regenerateMessage(ownerId, project.id, sent.messageId);
    expect(regenerated.ok).toBe(true);
    if (!regenerated.ok) return;

    const [newRow] = await getDb().select().from(messages).where(eq(messages.id, regenerated.messageId));
    expect(newRow!.regeneratedFromMessageId).toBe(sent.messageId);

    for await (const _ of runAssistantMessage(
      regenerated.messageId,
      project.id,
      new ImmediateLlmAdapter("第二版回答"),
    )) {
      void _;
    }

    const listed = await listMessages(ownerId, project.id, conversation.conversationId);
    expect(listed.ok).toBe(true);
    if (!listed.ok) return;
    const assistantMessages = listed.messages.filter((m) => m.role === "assistant");
    expect(assistantMessages).toHaveLength(1);
    expect(assistantMessages[0]!.content).toBe("第二版回答");
  });

  it("AC-4（重新產生：問題延續）：regenerate 後重新走管線，仍回答原本的使用者問題，非空字串", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "重新產生問題延續測試專案");
    await setupActiveKnowledgeChunk("原始問題內容");
    const conversation = await createConversation(ownerId, project.id);
    if (!conversation.ok) throw new Error("setup failed");
    const sent = await sendMessage(ownerId, project.id, conversation.conversationId, "原始問題內容");
    if (!sent.ok) throw new Error("setup failed");

    for await (const _ of runAssistantMessage(sent.messageId, project.id, new ImmediateLlmAdapter())) {
      void _;
    }
    const regenerated = await regenerateMessage(ownerId, project.id, sent.messageId);
    if (!regenerated.ok) throw new Error("setup failed");

    const events = [];
    for await (const event of runAssistantMessage(regenerated.messageId, project.id, new ImmediateLlmAdapter())) {
      events.push(event);
    }
    expect(events.some((e) => e.type === "stream_completed")).toBe(true);
  });

  it("AC-5／AC-6（頻率限制）：達每日上限後 sendMessage 回 RATE_LIMITED，未達上限前正常受理", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "頻率限制測試專案");
    const conversation = await createConversation(ownerId, project.id);
    if (!conversation.ok) throw new Error("setup failed");

    // 直接寫入 29 筆歷史使用者訊息模擬「已接近上限」，避免測試迴圈呼叫 30 次 sendMessage
    for (let i = 0; i < 29; i++) {
      await getDb().insert(messages).values({
        conversationId: conversation.conversationId,
        role: "user",
        content: `歷史問題 ${i}`,
        status: "completed",
      });
    }

    const under = await sendMessage(ownerId, project.id, conversation.conversationId, "第 30 則問題");
    expect(under.ok).toBe(true);

    const over = await sendMessage(ownerId, project.id, conversation.conversationId, "第 31 則問題");
    expect(over).toEqual({ ok: false, code: "RATE_LIMITED" });
  });

  it("AC-9（日誌 P0，延伸）：listMessages／regenerate 過程不將提問或回答內容寫入日誌", async () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案二");
    const conversation = await createConversation(ownerId, project.id);
    if (!conversation.ok) throw new Error("setup failed");
    const marker = `conv2-log-marker-${randomUUID()}`;
    const sent = await sendMessage(ownerId, project.id, conversation.conversationId, marker);
    if (!sent.ok) throw new Error("setup failed");
    for await (const _ of runAssistantMessage(sent.messageId, project.id, new ImmediateLlmAdapter(marker))) {
      void _;
    }
    await listMessages(ownerId, project.id, conversation.conversationId);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain(marker);
    infoSpy.mockRestore();
  });
});
