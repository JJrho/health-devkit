import { and, desc, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { projects } from "@/db/schema";
import { findOwnedProject, type ProjectRow } from "./access";

export type MutationResult =
  | { ok: true; project: ProjectRow }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "VERSION_CONFLICT" };

/** insert/update 針對已知單一主鍵的 .returning()，保證恰有一列 */
function first(rows: ProjectRow[]): ProjectRow {
  return rows[0]!;
}

/** AC-1：建立專案，owner＝目前登入者、version=1（C6：未驗證帳號亦可建立） */
export async function createProject(ownerId: string, name: string): Promise<ProjectRow> {
  const rows = await getDb().insert(projects).values({ ownerId, name }).returning();
  return first(rows);
}

/** AC-2：列表排除已刪除，依最近存取排序；回傳最近專案 id 供重新登入導向 */
export async function listProjects(
  ownerId: string,
): Promise<{ items: ProjectRow[]; mostRecentProjectId: string | null }> {
  const items = await getDb()
    .select()
    .from(projects)
    .where(and(eq(projects.ownerId, ownerId), isNull(projects.deletedAt)))
    .orderBy(desc(projects.lastAccessedAt));
  return { items, mostRecentProjectId: items[0]?.id ?? null };
}

/** 單一專案存取：套四層鏈第 2～4 層＋標記為最近存取 */
export async function getProject(userId: string, projectId: string): Promise<ProjectRow | null> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return null;
  const rows = await getDb()
    .update(projects)
    .set({ lastAccessedAt: new Date() })
    .where(eq(projects.id, project.id))
    .returning();
  return first(rows);
}

/** AC-3：改名＋OCC 樂觀鎖（本案首次落地 VERSION_CONFLICT，不靜默覆寫） */
export async function renameProject(
  userId: string,
  projectId: string,
  name: string,
  expectedVersion: number,
): Promise<MutationResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (project.version !== expectedVersion) return { ok: false, code: "VERSION_CONFLICT" };

  const now = new Date();
  const rows = await getDb()
    .update(projects)
    .set({ name, version: project.version + 1, updatedAt: now, lastAccessedAt: now })
    .where(eq(projects.id, project.id))
    .returning();
  return { ok: true, project: first(rows) };
}

/** AC-4：封存（active→archived）；已封存者視為冪等成功，不重複計版本 */
export async function archiveProject(userId: string, projectId: string): Promise<MutationResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (project.archivedAt) return { ok: true, project };

  const now = new Date();
  const rows = await getDb()
    .update(projects)
    .set({ archivedAt: now, version: project.version + 1, updatedAt: now, lastAccessedAt: now })
    .where(eq(projects.id, project.id))
    .returning();
  return { ok: true, project: first(rows) };
}

/** AC-4：還原（archived→active）；已是 active 者視為冪等成功 */
export async function restoreProject(userId: string, projectId: string): Promise<MutationResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };
  if (!project.archivedAt) return { ok: true, project };

  const now = new Date();
  const rows = await getDb()
    .update(projects)
    .set({ archivedAt: null, version: project.version + 1, updatedAt: now, lastAccessedAt: now })
    .where(eq(projects.id, project.id))
    .returning();
  return { ok: true, project: first(rows) };
}

/** AC-5：軟刪除（任一非刪除狀態→deleted）；本輪無依附健康資料，無串聯清理（A13） */
export async function deleteProject(userId: string, projectId: string): Promise<MutationResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const now = new Date();
  const rows = await getDb()
    .update(projects)
    .set({ deletedAt: now, version: project.version + 1, updatedAt: now })
    .where(eq(projects.id, project.id))
    .returning();
  return { ok: true, project: first(rows) };
}
