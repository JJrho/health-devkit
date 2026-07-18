import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { documents, observations, testDefinitions } from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";

export interface TrendPoint {
  observationId: string;
  date: string;
  dateEstimated: boolean;
  value: string;
  referenceRange: string | null;
  documentId: string;
  pageNumber: number;
}

export interface TrendSeries {
  testDefinitionId: string;
  canonicalName: string;
  unit: string;
  /** A48：同一 testDefinitionId 出現一種以上 unit 時為 true（結構上不應發生，縱深防禦旗標） */
  unitMismatch: boolean;
  points: TrendPoint[];
}

/**
 * E3-F2（SDD §4.7；上游 §22.4／§28.5）：依測項分組成時間序列。
 * 只讀 status=active 的 observations（上游 §29 BDD：未確認資料不納入正式趨勢，
 * 結構性保證——extracted_items 未確認前根本不會有對應 observation）。
 * A48：再依 unit 分組，若同一 testDefinitionId 出現一種以上 unit（理論上不該
 * 發生，因 E2-F4 寫入時已保證同一 definition 皆為 canonical 換算後單位），
 * 拆成獨立子序列並標記 unitMismatch，絕不靜默合併（縱深防禦）。
 */
export async function getTrends(
  userId: string,
  projectId: string,
): Promise<{ ok: true; series: TrendSeries[] } | { ok: false; code: "PROJECT_ACCESS_DENIED" }> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const rows = await getDb()
    .select({
      observation: observations,
      canonicalName: testDefinitions.canonicalName,
      reportDate: documents.reportDate,
      documentCreatedAt: documents.createdAt,
    })
    .from(observations)
    .innerJoin(testDefinitions, eq(observations.testDefinitionId, testDefinitions.id))
    .innerJoin(documents, eq(observations.documentId, documents.id))
    .where(and(eq(observations.projectId, project.id), eq(observations.status, "active")));

  type GroupEntry = {
    testDefinitionId: string;
    canonicalName: string;
    unit: string;
    points: TrendPoint[];
  };
  const groups = new Map<string, GroupEntry>();
  const unitsByDefinition = new Map<string, Set<string>>();

  for (const row of rows) {
    const { observation } = row;
    const key = `${observation.testDefinitionId}::${observation.unit}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        testDefinitionId: observation.testDefinitionId,
        canonicalName: row.canonicalName,
        unit: observation.unit,
        points: [],
      };
      groups.set(key, group);
    }

    const seenUnits = unitsByDefinition.get(observation.testDefinitionId) ?? new Set<string>();
    seenUnits.add(observation.unit);
    unitsByDefinition.set(observation.testDefinitionId, seenUnits);

    const dateEstimated = row.reportDate === null;
    const date = row.reportDate ?? row.documentCreatedAt.toISOString().slice(0, 10);

    group.points.push({
      observationId: observation.id,
      date,
      dateEstimated,
      value: observation.numericValue,
      referenceRange: observation.rawReferenceRange,
      documentId: observation.documentId,
      pageNumber: observation.pageNumber,
    });
  }

  const series: TrendSeries[] = Array.from(groups.values()).map((group) => ({
    testDefinitionId: group.testDefinitionId,
    canonicalName: group.canonicalName,
    unit: group.unit,
    unitMismatch: (unitsByDefinition.get(group.testDefinitionId)?.size ?? 1) > 1,
    points: group.points.sort((a, b) => a.date.localeCompare(b.date)),
  }));
  series.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName) || a.unit.localeCompare(b.unit));

  return { ok: true, series };
}
