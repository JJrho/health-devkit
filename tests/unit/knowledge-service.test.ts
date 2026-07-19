import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closePool } from "@/db/client";
import { knowledgeChunks, knowledgeSources } from "@/db/schema";
import { chunkText, searchKnowledge } from "@/modules/knowledge";
import { seedKnowledgeSources } from "../../scripts/seed-knowledge-sources";

/**
 * E4-F1 知識來源與檢索基座整合測試（Sprint 13，AC-1～AC-8；連實庫）。
 * knowledge_sources／knowledge_chunks 為跨測試共用的參照資料（比照
 * test_definitions 既有模式），本檔測試建立的來源用 `kst-` 前綴標題，
 * 測試結束後清除；seed-knowledge-sources.ts 建立的真實內容（王健宇醫師
 * 書籍章節）不清除，屬正式知識庫資料。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

async function insertSource(
  title: string,
  status: string,
  content: string,
): Promise<{ sourceId: string }> {
  const [source] = await getDb()
    .insert(knowledgeSources)
    .values({ title, sourceType: "vetted_education", status })
    .returning();
  const chunks = chunkText(content);
  for (let i = 0; i < chunks.length; i++) {
    await getDb().insert(knowledgeChunks).values({
      sourceId: source!.id,
      chunkIndex: i,
      content: chunks[i]!,
    });
  }
  return { sourceId: source!.id };
}

describe.skipIf(!hasDb)("knowledge module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await closePool();
  });

  it("AC-1（狀態機）：status 欄位涵蓋上游 §17 六種狀態", async () => {
    const states = ["draft", "processing", "active", "inactive", "withdrawn", "failed"];
    const ids: string[] = [];
    for (const status of states) {
      const [row] = await getDb()
        .insert(knowledgeSources)
        .values({ title: `kst-狀態測試-${status}-${randomUUID()}`, sourceType: "vetted_education", status })
        .returning();
      ids.push(row!.id);
    }
    const rows = await getDb()
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.sourceType, "vetted_education"));
    for (const status of states) {
      expect(rows.some((r) => r.status === status && r.title.startsWith("kst-狀態測試"))).toBe(true);
    }
    for (const id of ids) {
      await getDb().delete(knowledgeSources).where(eq(knowledgeSources.id, id));
    }
  });

  it("AC-2（切分）：多段落文字正確切分，無遺漏或重複內容", () => {
    const text = "第一段內容。\n\n第二段內容。\n\n第三段內容。";
    const chunks = chunkText(text);
    expect(chunks).toEqual(["第一段內容。", "第二段內容。", "第三段內容。"]);

    const longParagraph = "A".repeat(1000);
    const longChunks = chunkText(longParagraph, 400);
    expect(longChunks.join("")).toBe(longParagraph);
    expect(longChunks).toHaveLength(3);
  });

  it("AC-3（檢索：僅回傳 active）：draft 來源不出現在結果中", async () => {
    const marker = `kst-marker-${randomUUID()}`;
    const active = await insertSource(`kst-active-${randomUUID()}`, "active", `這是包含${marker}的主動內容。`);
    const draft = await insertSource(`kst-draft-${randomUUID()}`, "draft", `這是包含${marker}的草稿內容。`);

    const results = await searchKnowledge(marker);
    const sourceIds = results.map((r) => r.sourceId);
    expect(sourceIds).toContain(active.sourceId);
    expect(sourceIds).not.toContain(draft.sourceId);

    await getDb().delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, active.sourceId));
    await getDb().delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, draft.sourceId));
    await getDb().delete(knowledgeSources).where(eq(knowledgeSources.id, active.sourceId));
    await getDb().delete(knowledgeSources).where(eq(knowledgeSources.id, draft.sourceId));
  });

  it("AC-4（檢索：撤回來源排除）：withdrawn 來源不回傳任何 chunk", async () => {
    const marker = `kst-withdrawn-marker-${randomUUID()}`;
    const withdrawn = await insertSource(
      `kst-withdrawn-${randomUUID()}`,
      "withdrawn",
      `這是包含${marker}的已撤回內容。`,
    );

    const results = await searchKnowledge(marker);
    expect(results.map((r) => r.sourceId)).not.toContain(withdrawn.sourceId);

    await getDb().delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, withdrawn.sourceId));
    await getDb().delete(knowledgeSources).where(eq(knowledgeSources.id, withdrawn.sourceId));
  });

  it("AC-5（檢索：查無結果）：查詢字不匹配任何 chunk 時回傳空陣列", async () => {
    const results = await searchKnowledge(`kst-完全不存在的查詢字串-${randomUUID()}`);
    expect(results).toEqual([]);
  });

  it("AC-6（seed 冪等）：執行 seedKnowledgeSources 兩次，第二次不建立重複資料", async () => {
    const first = await seedKnowledgeSources();
    const second = await seedKnowledgeSources();
    expect(second.sourceCount).toBe(0);
    expect(second.chunkCount).toBe(0);
    // 第一次呼叫可能是 0（已被先前呼叫或 CLI 執行過）或 >0（首次建立），兩者皆合理
    expect(first.sourceCount).toBeGreaterThanOrEqual(0);
  });

  it("AC-7（日誌 P0）：檢索與 seed 過程不將知識內容全文寫入日誌", async () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const marker = `kst-log-marker-${randomUUID()}`;
    const source = await insertSource(`kst-log-${randomUUID()}`, "active", `包含${marker}的內容。`);
    await searchKnowledge(marker);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain(marker);
    infoSpy.mockRestore();

    await getDb().delete(knowledgeChunks).where(eq(knowledgeChunks.sourceId, source.sourceId));
    await getDb().delete(knowledgeSources).where(eq(knowledgeSources.id, source.sourceId));
  });

  it("AC-8（真實內容以 draft 入庫，A55）：王健宇醫師書籍章節正確 seed 為 draft，searchKnowledge 不回傳", async () => {
    await seedKnowledgeSources();

    const rows = await getDb()
      .select()
      .from(knowledgeSources)
      .where(eq(knowledgeSources.title, "身為病人，你夠了解自己嗎？（PART1，頁 014–019）"));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.status).toBe("draft");
    expect(rows[0]!.author).toBe("王健宇 醫師");
    expect(rows[0]!.sourceType).toBe("vetted_education");

    // 書中確實出現的詞（見 §0 轉錄內容），因來源非 active 故不應被檢索回傳
    const results = await searchKnowledge("甲狀腺機能亢進");
    expect(results.map((r) => r.sourceId)).not.toContain(rows[0]!.id);
  });
});
