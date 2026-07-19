import { randomUUID } from "crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
import { eq, inArray, like } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import type {
  ClaimedJob,
  EnqueueInput,
  LlmAdapter,
  LlmStreamChunk,
  LlmStreamRequest,
  QueueAdapter,
  QueueJobView,
  StorageAdapter,
} from "@/adapters";
import { getDb, closePool } from "@/db/client";
import {
  documents,
  extractedItems,
  knowledgeChunks,
  knowledgeSources,
  observations,
  testAliases,
  testDefinitionUnits,
  testDefinitions,
  users,
} from "@/db/schema";
import { createProject, findOwnedProject } from "@/modules/projects";
import { completeUpload, createUploadSession, uploadPart } from "@/modules/documents";
import { standardizeDocument } from "@/modules/observations";
import {
  cancelMessage,
  createConversation,
  runAssistantMessage,
  sendMessage,
  validateAndExtractCitations,
} from "@/modules/conversations";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E4-F3 PoC 1/2 整合測試（Sprint 15，AC-1／AC-3～AC-9；連實庫）。
 * AC-2／AC-10 需真實 OpenAI API 呼叫，另以 skipIf(!hasOpenAiKey) 隔離（A68）。
 * runAssistantMessage() 透過依賴注入接受 LlmAdapter，本檔多數測試改用
 * FakeLlmAdapter，不需真實 API key 即可驗證狀態機／引用驗證／取消等核心邏輯。
 */
const hasDb = Boolean(process.env.DATABASE_URL);
const hasOpenAiKey = Boolean(process.env.OPENAI_API_KEY);

class ImmediateLlmAdapter implements LlmAdapter {
  constructor(private readonly text: string) {}
  async *streamCompletion(): AsyncIterable<LlmStreamChunk> {
    yield { type: "text", delta: this.text };
    yield { type: "done", finishReason: "stop" };
  }
}

class ThrowingLlmAdapter implements LlmAdapter {
  async *streamCompletion(): AsyncIterable<LlmStreamChunk> {
    throw new Error("AC-6 不應呼叫 LLM：檢索結果為空時應在 safety_check 階段就阻擋");
  }
}

class SlowLlmAdapter implements LlmAdapter {
  async *streamCompletion(request: LlmStreamRequest): AsyncIterable<LlmStreamChunk> {
    for (let i = 0; i < 20; i++) {
      if (request.abortSignal?.aborted) {
        yield { type: "done", finishReason: "cancelled" };
        return;
      }
      yield { type: "text", delta: "片段。" };
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
    yield { type: "done", finishReason: "stop" };
  }
}

class FakeStorageAdapter implements StorageAdapter {
  private store = new Map<string, Buffer>();
  async putObject(key: string, body: Buffer): Promise<void> {
    this.store.set(key, body);
  }
  async getObject(key: string): Promise<Buffer> {
    const value = this.store.get(key);
    if (!value) throw new Error(`not found: ${key}`);
    return value;
  }
  async getSignedDownloadUrl(key: string): Promise<string> {
    return `https://fake-storage.invalid/${key}`;
  }
  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }
}

class FakeQueueAdapter implements QueueAdapter {
  async enqueue(input: EnqueueInput): Promise<{ id: string }> {
    void input;
    return { id: randomUUID() };
  }
  async claimNext(): Promise<ClaimedJob | null> {
    return null;
  }
  async complete(): Promise<void> {}
  async fail(): Promise<void> {}
  async getJob(): Promise<QueueJobView | null> {
    return null;
  }
}

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `conv-${id}@projects.test.invalid` });
  return id;
}

async function ensureWbcDefinition(): Promise<void> {
  const db = getDb();
  const existing = await db
    .select()
    .from(testDefinitions)
    .where(eq(testDefinitions.canonicalName, "WBC"))
    .limit(1);
  const definitionId =
    existing[0]?.id ??
    (await db.insert(testDefinitions).values({ canonicalName: "WBC", canonicalUnit: "10^3/uL" }).returning())[0]!.id;

  const existingAlias = await db.select().from(testAliases).where(eq(testAliases.aliasText, "WBC")).limit(1);
  if (!existingAlias[0]) {
    await db.insert(testAliases).values({ testDefinitionId: definitionId, aliasText: "WBC" });
  }
  const existingUnit = await db
    .select()
    .from(testDefinitionUnits)
    .where(eq(testDefinitionUnits.testDefinitionId, definitionId))
    .limit(1);
  if (!existingUnit[0]) {
    await db
      .insert(testDefinitionUnits)
      .values({ testDefinitionId: definitionId, unitText: "10^3/uL", factorToCanonical: "1" });
  }
}

/** 走完整上傳→候選列→標準化管線，回傳一筆真實 observation id（AC-3 等引用驗證測試需要真實存在的資料） */
async function setupConfirmedObservation(ownerId: string, projectId: string): Promise<string> {
  const storage = new FakeStorageAdapter();
  const queue = new FakeQueueAdapter();
  const session = await createUploadSession(ownerId, projectId, {
    idempotencyKey: randomUUID(),
    filename: "report.pdf",
  });
  if (!session.ok) throw new Error("setup failed");
  const pdfDoc = await PDFDocument.create();
  pdfDoc.addPage();
  const pdfBytes = Buffer.from(await pdfDoc.save());
  await uploadPart(storage, ownerId, projectId, session.document.id, 1, pdfBytes);
  const completed = await completeUpload(storage, queue, ownerId, projectId, session.document.id, 1);
  if (!completed.ok) throw new Error("setup failed: complete");
  await getDb().update(documents).set({ status: "review_required" }).where(eq(documents.id, completed.document.id));
  await getDb().insert(extractedItems).values({
    documentId: completed.document.id,
    rawTestName: "WBC",
    rawValue: "6.2",
    rawUnit: "10^3/uL",
    confidence: 0.95,
    pageNumber: 1,
    coordinates: { x: 0, y: 0, width: 0, height: 0 },
    status: "accepted",
  });
  await standardizeDocument(completed.document.id);
  const [obs] = await getDb().select().from(observations).where(eq(observations.documentId, completed.document.id));
  return obs!.id;
}

/** 建一筆合成 status=active 知識來源＋chunk（A72：真實王醫師內容皆 draft，PoC 需另建 active 來源測試引用） */
async function setupActiveKnowledgeChunk(): Promise<string> {
  const [source] = await getDb()
    .insert(knowledgeSources)
    .values({ title: `conv-合成來源-${randomUUID()}`, sourceType: "peer_reviewed_guideline", status: "active" })
    .returning();
  const [chunk] = await getDb()
    .insert(knowledgeChunks)
    .values({ sourceId: source!.id, chunkIndex: 0, content: "白血球數值偏高或偏低皆建議與醫師討論。" })
    .returning();
  return chunk!.id;
}

describe.skipIf(!hasDb)("conversations module（整合，需 DATABASE_URL）", () => {
  beforeAll(async () => {
    await ensureWbcDefinition();
  });

  afterAll(async () => {
    // 先清 cleanupTestData（含 message_citations，可能反向 FK 指向 knowledge_chunks），
    // 合成知識來源不歸其管（非使用者資料），比照 KB-030 精神最後自行清除，避免測試
    // 建立的虛構內容留存於共用資料庫；順序：message_citations 先清掉才能刪 knowledge_chunks
    await cleanupTestData("conv-%@projects.test.invalid");

    const synthetic = await getDb()
      .select({ id: knowledgeSources.id })
      .from(knowledgeSources)
      .where(like(knowledgeSources.title, "conv-合成來源-%"));
    const sourceIds = synthetic.map((s) => s.id);
    if (sourceIds.length > 0) {
      await getDb().delete(knowledgeChunks).where(inArray(knowledgeChunks.sourceId, sourceIds));
      await getDb().delete(knowledgeSources).where(inArray(knowledgeSources.id, sourceIds));
    }

    await closePool();
  });

  it("AC-1（狀態機）：messages.status 涵蓋上游 §17 八值", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "狀態機測試專案");
    const created = await createConversation(ownerId, project.id);
    expect(created.ok).toBe(true);
  });

  it("AC-3（引用驗證：合法引用通過）：ID 存在且屬本專案／來源 active → 保留在最終內容並記入 message_citations", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "引用驗證測試專案");
    const obsId = await setupConfirmedObservation(ownerId, project.id);
    const chunkId = await setupActiveKnowledgeChunk();

    const raw = `根據資料 [OBS:${obsId}]，並參考 [SRC:${chunkId}] 的建議。`;
    const result = await validateAndExtractCitations(
      raw,
      project.id,
      new Set([obsId]),
      new Set([chunkId]),
    );
    expect(result.cleanedContent).toContain(`[OBS:${obsId}]`);
    expect(result.cleanedContent).toContain(`[SRC:${chunkId}]`);
    expect(result.citations).toHaveLength(2);
  });

  it("AC-4（引用驗證：虛構引用剔除）：ID 未曾提供給模型 → 從內容中移除，不記入 citations", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "虛構引用測試專案");
    const fabricatedId = randomUUID();

    const raw = `根據資料 [OBS:${fabricatedId}] 判斷。`;
    const result = await validateAndExtractCitations(raw, project.id, new Set(), new Set());
    expect(result.cleanedContent).not.toContain(fabricatedId);
    expect(result.citations).toHaveLength(0);
  });

  it("AC-5（引用驗證：跨專案資料排除）：ID 確實存在且曾提供，但屬於另一專案 → 剔除", async () => {
    const ownerId = await seedUser();
    const projectA = await createProject(ownerId, "跨專案 A");
    const projectB = await createProject(ownerId, "跨專案 B");
    const obsIdInA = await setupConfirmedObservation(ownerId, projectA.id);

    // 模擬模型引用了「曾在 context 中出現」但實際屬於 projectA 的 id，卻拿去驗證 projectB
    const raw = `根據資料 [OBS:${obsIdInA}] 判斷。`;
    const result = await validateAndExtractCitations(raw, projectB.id, new Set([obsIdInA]), new Set());
    expect(result.cleanedContent).not.toContain(obsIdInA);
    expect(result.citations).toHaveLength(0);
  });

  it("AC-6（資料不足）：專案無任何已確認資料 → 直接 blocked＋AI_INSUFFICIENT_DATA，不呼叫 LLM", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "資料不足測試專案");
    const conversation = await createConversation(ownerId, project.id);
    if (!conversation.ok) throw new Error("setup failed");
    const sent = await sendMessage(ownerId, project.id, conversation.conversationId, "我的白血球數值正常嗎？");
    if (!sent.ok) throw new Error("setup failed");

    const events = [];
    for await (const event of runAssistantMessage(sent.messageId, project.id, new ThrowingLlmAdapter())) {
      events.push(event);
    }
    expect(events).toContainEqual({ type: "safety_notice", code: "AI_INSUFFICIENT_DATA" });
    expect(events).toContainEqual({ type: "stream_failed", errorCode: "AI_INSUFFICIENT_DATA" });

    const [row] = await getDb().select().from(observations).where(eq(observations.projectId, project.id));
    expect(row).toBeUndefined();
  });

  it("AC-7（取消）：streaming 階段呼叫 cancelMessage → AbortSignal 觸發，狀態轉 cancelled", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "取消測試專案");
    await setupConfirmedObservation(ownerId, project.id);
    const conversation = await createConversation(ownerId, project.id);
    if (!conversation.ok) throw new Error("setup failed");
    const sent = await sendMessage(ownerId, project.id, conversation.conversationId, "我的白血球數值趨勢如何？");
    if (!sent.ok) throw new Error("setup failed");

    const events: Array<{ type: string }> = [];
    const generator = runAssistantMessage(sent.messageId, project.id, new SlowLlmAdapter());
    const consumePromise = (async () => {
      for await (const event of generator) events.push(event);
    })();

    // 等到第一個 content_delta 真正出現才取消，避免在 retrieving_sources／safety_check
    // 階段（DB 查詢耗時不定）就呼叫 cancel，導致 activeStreams 尚未註冊 AbortController
    for (let i = 0; i < 100 && !events.some((e) => e.type === "content_delta"); i++) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    const cancelled = cancelMessage(sent.messageId);
    expect(cancelled).toBe(true);
    await consumePromise;

    expect(events.some((e) => e.type === "stream_cancelled")).toBe(true);
  });

  it("AC-8（四層權限鏈）：其他帳號存取一律 PROJECT_ACCESS_DENIED", async () => {
    const ownerId = await seedUser();
    const otherId = await seedUser();
    const project = await createProject(ownerId, "四層鏈測試專案");
    const conversation = await createConversation(ownerId, project.id);
    if (!conversation.ok) throw new Error("setup failed");

    const deniedCreate = await createConversation(otherId, project.id);
    expect(deniedCreate).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });

    const deniedSend = await sendMessage(otherId, project.id, conversation.conversationId, "問題");
    expect(deniedSend).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });

    const ownProject = await findOwnedProject(otherId, project.id);
    expect(ownProject).toBeNull();
  });

  it("AC-9（日誌 P0）：訊息流程不將提問全文、AI 回答全文或 prompt 寫入日誌", async () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    await setupConfirmedObservation(ownerId, project.id);
    const conversation = await createConversation(ownerId, project.id);
    if (!conversation.ok) throw new Error("setup failed");
    const marker = `conv-log-marker-${randomUUID()}`;
    const sent = await sendMessage(ownerId, project.id, conversation.conversationId, marker);
    if (!sent.ok) throw new Error("setup failed");

    for await (const _ of runAssistantMessage(
      sent.messageId,
      project.id,
      new ImmediateLlmAdapter(`回答內容包含 ${marker}`),
    )) {
      void _;
    }

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain(marker);
    infoSpy.mockRestore();
  });

  it.skipIf(!hasOpenAiKey)(
    "AC-2（有來源的健康問答，上游 §29；A68 真實 LLM 呼叫）：個人結論引用 observation，一般知識引用 knowledge_chunk",
    async () => {
      const ownerId = await seedUser();
      const project = await createProject(ownerId, "真實串流測試專案");
      await setupConfirmedObservation(ownerId, project.id);
      await setupActiveKnowledgeChunk();
      const conversation = await createConversation(ownerId, project.id);
      if (!conversation.ok) throw new Error("setup failed");
      const sent = await sendMessage(ownerId, project.id, conversation.conversationId, "我的白血球數值長期變化如何？");
      if (!sent.ok) throw new Error("setup failed");

      const { getLlmAdapter } = await import("@/modules/conversations");
      const events = [];
      for await (const event of runAssistantMessage(sent.messageId, project.id, getLlmAdapter())) {
        events.push(event);
      }
      expect(events.some((e) => e.type === "stream_completed")).toBe(true);
      expect(events.some((e) => e.type === "citation_added")).toBe(true);
    },
    30000,
  );

  it.skipIf(!hasOpenAiKey)(
    "AC-10（繁體中文，C18；A68 真實 LLM 呼叫）：回答為繁體中文",
    async () => {
      const ownerId = await seedUser();
      const project = await createProject(ownerId, "語言測試專案");
      await setupConfirmedObservation(ownerId, project.id);
      const conversation = await createConversation(ownerId, project.id);
      if (!conversation.ok) throw new Error("setup failed");
      const sent = await sendMessage(ownerId, project.id, conversation.conversationId, "我的白血球數值正常嗎？");
      if (!sent.ok) throw new Error("setup failed");

      const { getLlmAdapter } = await import("@/modules/conversations");
      let content = "";
      for await (const event of runAssistantMessage(sent.messageId, project.id, getLlmAdapter())) {
        if (event.type === "content_delta") content += event.delta;
      }
      expect(content).not.toMatch(/[぀-ヿ]/); // 不含日文假名，粗略排除語言錯置
      expect(content.length).toBeGreaterThan(0);
    },
    30000,
  );
});
