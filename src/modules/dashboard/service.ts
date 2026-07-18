import { and, eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { documents, observations, testDefinitions } from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";

export interface DashboardStatusItem {
  testDefinitionId: string;
  canonicalName: string;
  unit: string;
  value: string;
  referenceRange: string | null;
  date: string;
}

export interface DashboardChangeItem {
  testDefinitionId: string;
  canonicalName: string;
  direction: "up" | "down" | "flat";
}

/**
 * E3-F1（SDD §4.7／§5；上游 §26）：健康戰情頁區塊 1／3 的資料聚合。
 * A50：不做電腦化超標判讀，僅原樣回傳最新值＋參考區間，供 UI 直接顯示；
 * 「早期變化」僅描述數值升降方向，不判斷臨床意義，且需 ≥2 筆資料才給方向
 * （資料不足時不勉強猜測，比照 KB-024「誠實地不完整優於自信地錯」）。
 * 分組邏輯沿用 E3-F2 trends 的 testDefinitionId+unit 防護性分組（A48 精神延續）。
 */
export async function getDashboard(
  userId: string,
  projectId: string,
): Promise<
  | { ok: true; currentStatus: DashboardStatusItem[]; earlyChanges: DashboardChangeItem[] }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" }
> {
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

  type Point = { date: string; value: string; referenceRange: string | null };
  type Group = { testDefinitionId: string; canonicalName: string; unit: string; points: Point[] };
  const groups = new Map<string, Group>();

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
    const date = row.reportDate ?? row.documentCreatedAt.toISOString().slice(0, 10);
    group.points.push({ date, value: observation.numericValue, referenceRange: observation.rawReferenceRange });
  }

  const currentStatus: DashboardStatusItem[] = [];
  const earlyChanges: DashboardChangeItem[] = [];

  for (const group of groups.values()) {
    const sorted = group.points.sort((a, b) => a.date.localeCompare(b.date));
    const latest = sorted[sorted.length - 1]!;
    currentStatus.push({
      testDefinitionId: group.testDefinitionId,
      canonicalName: group.canonicalName,
      unit: group.unit,
      value: latest.value,
      referenceRange: latest.referenceRange,
      date: latest.date,
    });

    if (sorted.length >= 2) {
      const previous = sorted[sorted.length - 2]!;
      const delta = Number(latest.value) - Number(previous.value);
      const direction = delta > 0 ? "up" : delta < 0 ? "down" : "flat";
      earlyChanges.push({ testDefinitionId: group.testDefinitionId, canonicalName: group.canonicalName, direction });
    }
  }

  currentStatus.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));
  earlyChanges.sort((a, b) => a.canonicalName.localeCompare(b.canonicalName));

  return { ok: true, currentStatus, earlyChanges };
}
