import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { documents } from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";

export type DocumentRow = typeof documents.$inferSelect;

/**
 * 四層鏈第 1／2／4 層交給 findOwnedProject（沿用 E1-F4）；
 * 第 3 層「資源屬於專案」本輪首次在**有獨立 id 的巢狀資源**上真正生效——
 * 查詢一律同時比對 project.id 與 document_id，兩者缺一律回 null（不區分
 * 「文件不存在」與「文件屬於別的專案」，防列舉，比照 findOwnedProject 手法）。
 */
export async function findOwnedDocument(
  userId: string,
  projectId: string,
  documentId: string,
): Promise<DocumentRow | null> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return null;

  const rows = await getDb()
    .select()
    .from(documents)
    .where(
      and(
        eq(documents.id, documentId),
        eq(documents.projectId, project.id),
        isNull(documents.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
