import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { healthProfiles } from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";

export type HealthProfileRow = typeof healthProfiles.$inferSelect;

export type ProfileAccessResult =
  | { ok: true; profile: HealthProfileRow | null }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" };

export type ProfileMutationResult =
  | { ok: true; profile: HealthProfileRow }
  | { ok: false; code: "PROJECT_ACCESS_DENIED" | "VERSION_CONFLICT" };

/**
 * 四層鏈第 1／2／4 層交給 findOwnedProject（沿用 E1-F4）；
 * 第 3 層「資源屬於專案」對本模組是結構性保證——查詢一律用「已驗證擁有權的
 * project.id」去篩 health_profiles.project_id，從不接受前端傳入的獨立
 * profile id，等於從路徑設計上排除跨專案讀寫的可能（見 sprint-05-dor.md §1）。
 */
async function findProfileRow(projectId: string): Promise<HealthProfileRow | null> {
  const rows = await getDb()
    .select()
    .from(healthProfiles)
    .where(eq(healthProfiles.projectId, projectId))
    .limit(1);
  return rows[0] ?? null;
}

/** AC-1／AC-7：尚未建立回 profile:null（合法初始狀態，非錯誤）；續編回既有資料 */
export async function getProfile(userId: string, projectId: string): Promise<ProfileAccessResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const profile = await findProfileRow(project.id);
  return { ok: true, profile };
}

/**
 * AC-2／AC-3：autosave 上寫——首次建立不帶 version；已存在則須帶目前 version
 * 做 OCC，不符回 VERSION_CONFLICT（多分頁/autosave 競態不得靜默覆寫，上游 §19）。
 */
export async function upsertProfile(
  userId: string,
  projectId: string,
  data: Record<string, unknown>,
  expectedVersion: number | undefined,
): Promise<ProfileMutationResult> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return { ok: false, code: "PROJECT_ACCESS_DENIED" };

  const existing = await findProfileRow(project.id);

  if (!existing) {
    if (expectedVersion !== undefined) {
      // 宣稱有舊版本但實際不存在——視同版本衝突，避免誤建/誤覆寫
      return { ok: false, code: "VERSION_CONFLICT" };
    }
    const rows = await getDb()
      .insert(healthProfiles)
      .values({ projectId: project.id, data })
      .returning();
    return { ok: true, profile: rows[0]! };
  }

  if (existing.version !== expectedVersion) {
    return { ok: false, code: "VERSION_CONFLICT" };
  }
  const rows = await getDb()
    .update(healthProfiles)
    .set({ data, version: existing.version + 1, updatedAt: new Date() })
    .where(eq(healthProfiles.id, existing.id))
    .returning();
  return { ok: true, profile: rows[0]! };
}
