import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import { getDb, closePool } from "@/db/client";
import { evidenceClaims, knowledgeSources } from "@/db/schema";
import { getClaimsForTopic } from "@/modules/knowledge";

/**
 * E4-F2 主張與衝突模型整合測試（Sprint 14，AC-1～AC-7；連實庫）。
 *
 * 實作中修正（比照 Sprint 8「過程推翻 DOR 原訂技術方向」既有先例）：
 * DOR 草案原規劃另有獨立 seed script 示範「衝突」情境合成資料，實作時
 * 重新評估發現此舉有風險——若把虛構的研究內容（如「统合分析」「世代研究」）
 * 以 status=active 寫入與正式知識庫共用的資料庫，一旦 E4-F3 上線，AI 有可能
 * 把這些純屬測試示範用途的虛構研究當成真實證據引用給使用者，牴觸憲法 §3。
 * 改為本測試檔內建立、測試結束即刪除的暫時性資料（比照 knowledge-service.test.ts
 * 既有的 insertSource 暫時性資料模式），確保虛構示範內容不會留在資料庫中。
 * 因此本輪不建立 scripts/seed-evidence-claims.ts，也無「seed 冪等」驗收項。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

interface ClaimFixture {
  topicKey?: string;
  status?: string;
  sourceVersion?: number;
  withdrawn?: boolean;
  conflictStatus?: string | null;
  conflictReason?: string | null;
}

async function insertClaimWithSource(
  sourceTitle: string,
  fixture: ClaimFixture = {},
): Promise<{ sourceId: string; claimId: string }> {
  const [source] = await getDb()
    .insert(knowledgeSources)
    .values({
      title: sourceTitle,
      sourceType: "peer_reviewed_guideline",
      status: fixture.status ?? "active",
    })
    .returning();

  const [claim] = await getDb()
    .insert(evidenceClaims)
    .values({
      sourceId: source!.id,
      topicKey: fixture.topicKey ?? `ecl-topic-${randomUUID()}`,
      population: "停經後婦女",
      action: "每日攝取咖啡",
      dosage: "每日 3 杯以上",
      comparator: "不攝取咖啡者",
      outcome: "骨質密度變化",
      studyType: "世代研究",
      sourceVersion: fixture.sourceVersion ?? 1,
      withdrawn: fixture.withdrawn ?? false,
      conflictStatus: fixture.conflictStatus ?? null,
      conflictReason: fixture.conflictReason ?? null,
    })
    .returning();

  return { sourceId: source!.id, claimId: claim!.id };
}

async function cleanup(sourceId: string) {
  await getDb().delete(evidenceClaims).where(eq(evidenceClaims.sourceId, sourceId));
  await getDb().delete(knowledgeSources).where(eq(knowledgeSources.id, sourceId));
}

describe.skipIf(!hasDb)("evidence-claims module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await closePool();
  });

  it("AC-1（欄位完整性）：上游 §13.2 十三項欄位可正確寫入與讀出", async () => {
    const topicKey = `ecl-topic-${randomUUID()}`;
    const { sourceId } = await insertClaimWithSource(`ecl-完整性-${randomUUID()}`, { topicKey, status: "active" });

    const results = await getClaimsForTopic(topicKey);
    expect(results).toHaveLength(1);
    const claim = results[0]!;
    expect(claim.population).toBe("停經後婦女");
    expect(claim.action).toBe("每日攝取咖啡");
    expect(claim.dosage).toBe("每日 3 杯以上");
    expect(claim.comparator).toBe("不攝取咖啡者");
    expect(claim.outcome).toBe("骨質密度變化");
    expect(claim.studyType).toBe("世代研究");
    expect(claim.sourceVersion).toBe(1);
    expect(claim.withdrawn).toBe(false);

    await cleanup(sourceId);
  });

  it("AC-2（僅回傳 active 來源的主張）：draft 來源的主張不出現", async () => {
    const topicKey = `ecl-topic-${randomUUID()}`;
    const active = await insertClaimWithSource(`ecl-active-${randomUUID()}`, { topicKey, status: "active" });
    const draft = await insertClaimWithSource(`ecl-draft-${randomUUID()}`, { topicKey, status: "draft" });

    const results = await getClaimsForTopic(topicKey);
    const sourceIds = results.map((r) => r.sourceId);
    expect(sourceIds).toContain(active.sourceId);
    expect(sourceIds).not.toContain(draft.sourceId);

    await cleanup(active.sourceId);
    await cleanup(draft.sourceId);
  });

  it("AC-3（撤回來源排除）：withdrawn 來源的主張不回傳", async () => {
    const topicKey = `ecl-topic-${randomUUID()}`;
    const withdrawn = await insertClaimWithSource(`ecl-withdrawn-${randomUUID()}`, {
      topicKey,
      status: "withdrawn",
    });

    const results = await getClaimsForTopic(topicKey);
    expect(results.map((r) => r.sourceId)).not.toContain(withdrawn.sourceId);

    await cleanup(withdrawn.sourceId);
  });

  it("AC-4（衝突情境可查詢）：同 topicKey 下兩筆 conflictStatus 不同的主張皆正確回傳（上游 §29 咖啡與骨質疏鬆範例）", async () => {
    const topicKey = `ecl-咖啡與骨質疏鬆風險-${randomUUID()}`;
    const claimA = await insertClaimWithSource(`ecl-研究A-${randomUUID()}`, {
      topicKey,
      status: "active",
      conflictStatus: "mixed_evidence",
      conflictReason: "部分研究顯示高攝取量與骨質密度下降有關，但效應量小且未一致複現",
    });
    const claimB = await insertClaimWithSource(`ecl-研究B-${randomUUID()}`, {
      topicKey,
      status: "active",
      conflictStatus: "different_conditions",
      conflictReason: "校正鈣質攝取量後，兩篇研究對咖啡攝取與骨質密度的關聯方向不同",
    });

    const results = await getClaimsForTopic(topicKey);
    expect(results).toHaveLength(2);
    const bySource = new Map(results.map((r) => [r.sourceId, r]));
    expect(bySource.get(claimA.sourceId)?.conflictStatus).toBe("mixed_evidence");
    expect(bySource.get(claimB.sourceId)?.conflictStatus).toBe("different_conditions");
    expect(bySource.get(claimA.sourceId)?.conflictReason).toContain("效應量小");

    await cleanup(claimA.sourceId);
    await cleanup(claimB.sourceId);
  });

  it("AC-5（查無主題）：topicKey 不匹配任何主張時回傳空陣列", async () => {
    const results = await getClaimsForTopic(`ecl-完全不存在的主題-${randomUUID()}`);
    expect(results).toEqual([]);
  });

  it("AC-6（日誌 P0）：主張查詢過程不將主張內容全文寫入日誌", async () => {
    const infoSpy = vi.spyOn(console, "log").mockImplementation(() => {});
    const topicKey = `ecl-topic-${randomUUID()}`;
    const marker = `ecl-log-marker-${randomUUID()}`;
    const { sourceId } = await insertClaimWithSource(`ecl-log-${randomUUID()}`, { topicKey, status: "active" });
    await getDb().update(evidenceClaims).set({ outcome: marker }).where(eq(evidenceClaims.topicKey, topicKey));

    await getClaimsForTopic(topicKey);

    const output = infoSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain(marker);
    infoSpy.mockRestore();

    await cleanup(sourceId);
  });
});
