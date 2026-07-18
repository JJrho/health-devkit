import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  documents,
  extractedItems,
  observations,
  testAliases,
  testDefinitionUnits,
  testDefinitions,
} from "@/db/schema";
import { logger } from "@/lib/logger";
import { findOwnedProject } from "@/modules/projects";

export type ObservationRow = typeof observations.$inferSelect;
export type ObservationWithName = ObservationRow & { canonicalName: string };

const STANDARDIZABLE_STATUSES = new Set(["edited", "accepted"]);

/**
 * E2-F4 標準化核心（SDD §4.6；上游 §17：正式紀錄「由確認建立」）。
 * 內部信任呼叫（Worker 觸發，由 confirmDocument 成功後 enqueue），不走四層鏈。
 * 別名精確比對（trim 後）＋單位白名單換算；找不到別名或單位不在白名單，
 * 一律不建立 observation（A40／SDD §4.6：「不能合併就寧可不畫線」），
 * 不報錯、不中斷其他列的標準化。
 */
export async function standardizeDocument(documentId: string): Promise<void> {
  const db = getDb();
  const docRows = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  const document = docRows[0];
  if (!document) throw new Error("文件不存在");

  const items = await db
    .select()
    .from(extractedItems)
    .where(eq(extractedItems.documentId, documentId));

  for (const item of items) {
    if (!STANDARDIZABLE_STATUSES.has(item.status)) continue; // rejected／未審查列不參與

    const trimmedName = item.rawTestName.trim();
    const aliasRows = await db
      .select()
      .from(testAliases)
      .where(eq(testAliases.aliasText, trimmedName))
      .limit(1);
    const alias = aliasRows[0];
    if (!alias) continue; // 別名庫未涵蓋，維持在 extracted_items，不猜測對應

    if (!item.rawUnit) continue; // 無法辨識的單位，不可換算
    const trimmedUnit = item.rawUnit.trim();
    const unitRows = await db
      .select()
      .from(testDefinitionUnits)
      .where(
        and(
          eq(testDefinitionUnits.testDefinitionId, alias.testDefinitionId),
          eq(testDefinitionUnits.unitText, trimmedUnit),
        ),
      )
      .limit(1);
    const unitDef = unitRows[0];
    if (!unitDef) continue; // 單位不在白名單，不可換算，不得錯誤連線

    const rawNumeric = Number(item.rawValue);
    if (!Number.isFinite(rawNumeric)) continue; // 防禦：理論上 E2-F2 VALUE_TOKEN 已過濾

    const numericValue = rawNumeric * Number(unitDef.factorToCanonical);

    await db.insert(observations).values({
      projectId: document.projectId,
      documentId: item.documentId,
      extractedItemId: item.id,
      testDefinitionId: alias.testDefinitionId,
      numericValue: String(numericValue),
      unit: unitDef.unitText,
      rawValue: item.rawValue,
      rawUnit: item.rawUnit,
      pageNumber: item.pageNumber,
      coordinates: item.coordinates,
      status: "active",
    });
  }

  logger.info("標準化完成", { status: "completed" });
}

/** 四層鏈重用（projects 的 findOwnedProject）：列出專案下所有正式紀錄（僅 active），含項目名稱供 UI 顯示 */
export async function listObservations(
  userId: string,
  projectId: string,
): Promise<
  { ok: true; items: ObservationWithName[] } | { ok: false; code: "PROJECT_ACCESS_DENIED" }
> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const rows = await getDb()
    .select({ observation: observations, canonicalName: testDefinitions.canonicalName })
    .from(observations)
    .innerJoin(testDefinitions, eq(observations.testDefinitionId, testDefinitions.id))
    .where(and(eq(observations.projectId, project.id), eq(observations.status, "active")));
  const items = rows.map((row) => ({ ...row.observation, canonicalName: row.canonicalName }));
  return { ok: true, items };
}

async function findOwnedObservation(
  userId: string,
  projectId: string,
  observationId: string,
): Promise<
  | { ok: true; item: ObservationRow }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" }
> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const rows = await getDb()
    .select()
    .from(observations)
    .where(and(eq(observations.id, observationId), eq(observations.projectId, project.id)))
    .limit(1);
  if (!rows[0]) return { ok: false, code: "NOT_FOUND" };
  return { ok: true, item: rows[0] };
}

/** 軟刪除（A42 沿用既有 soft-delete 慣例） */
export async function deleteObservation(
  userId: string,
  projectId: string,
  observationId: string,
): Promise<{ ok: true } | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" }> {
  const found = await findOwnedObservation(userId, projectId, observationId);
  if (!found.ok) return found;

  await getDb()
    .update(observations)
    .set({ status: "deleted", deletedAt: new Date(), updatedAt: new Date() })
    .where(eq(observations.id, found.item.id));
  return { ok: true };
}

/**
 * A42：編輯採「整列新增＋前版 superseded」完整版本鏈，非原地覆寫。
 * 需帶入呼叫端目前所知的 version 做樂觀鎖（VERSION_CONFLICT）。
 */
export async function updateObservation(
  userId: string,
  projectId: string,
  observationId: string,
  input: { version: number; numericValue?: string; unit?: string },
): Promise<
  | { ok: true; item: ObservationRow }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "NOT_FOUND" | "VERSION_CONFLICT" }
> {
  const found = await findOwnedObservation(userId, projectId, observationId);
  if (!found.ok) return found;
  const current = found.item;
  if (current.version !== input.version) return { ok: false, code: "VERSION_CONFLICT" };

  const db = getDb();
  const rows = await db.transaction(async (tx) => {
    const superseded = await tx
      .update(observations)
      .set({ status: "superseded", updatedAt: new Date() })
      .where(and(eq(observations.id, current.id), eq(observations.version, input.version)))
      .returning();
    if (!superseded[0]) return [];

    return tx
      .insert(observations)
      .values({
        projectId: current.projectId,
        documentId: current.documentId,
        extractedItemId: current.extractedItemId,
        testDefinitionId: current.testDefinitionId,
        numericValue: input.numericValue ?? current.numericValue,
        unit: input.unit ?? current.unit,
        rawValue: current.rawValue,
        rawUnit: current.rawUnit,
        pageNumber: current.pageNumber,
        coordinates: current.coordinates,
        status: "active",
        version: current.version + 1,
      })
      .returning();
  });
  if (!rows[0]) return { ok: false, code: "VERSION_CONFLICT" };
  return { ok: true, item: rows[0] };
}
