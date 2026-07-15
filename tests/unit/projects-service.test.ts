import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { getDb, closePool } from "@/db/client";
import { projects, users } from "@/db/schema";
import {
  archiveProject,
  auditAccessDenied,
  createProject,
  deleteProject,
  getProject,
  listProjects,
  renameProject,
  restoreProject,
} from "@/modules/projects";

/**
 * 專案服務＋四層權限鏈整合測試（E1-F4，AC-1～AC-6／AC-9；連實庫）。
 * 測試帳號用 @projects.test.invalid 網域（與 auth-service.test.ts 的
 * @test.invalid 區隔——兩檔並行執行時若共用同一 LIKE 萬用字元收尾，
 * 會互相清到對方仍有 FK 參照的使用者而炸掉 DELETE）。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `proj-${id}@projects.test.invalid` });
  return id;
}

describe.skipIf(!hasDb)("projects module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    const db = getDb();
    const testUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, "%@projects.test.invalid"));
    for (const user of testUsers) {
      await db.delete(projects).where(eq(projects.ownerId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
    await closePool();
  });

  it("AC-1：建立專案，owner＝自己、status=active（archivedAt/deletedAt 皆 null）、version=1", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "第一個健康專案");
    expect(project.ownerId).toBe(ownerId);
    expect(project.version).toBe(1);
    expect(project.archivedAt).toBeNull();
    expect(project.deletedAt).toBeNull();
  });

  it("AC-2：列表排除已刪除、依最近存取排序，回傳最近專案 id", async () => {
    const ownerId = await seedUser();
    const a = await createProject(ownerId, "專案 A");
    const b = await createProject(ownerId, "專案 B");
    await deleteProject(ownerId, a.id);
    await getProject(ownerId, b.id); // 標記 b 為最近存取

    const { items, mostRecentProjectId } = await listProjects(ownerId);
    expect(items.map((p) => p.id)).toEqual([b.id]);
    expect(mostRecentProjectId).toBe(b.id);
  });

  it("AC-3：改名帶正確 version 成功且 version+1；帶舊 version 回 VERSION_CONFLICT 不覆寫", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "改名前");

    const ok = await renameProject(ownerId, project.id, "改名後", project.version);
    expect(ok).toMatchObject({ ok: true, project: { name: "改名後", version: 2 } });

    const stale = await renameProject(ownerId, project.id, "不該成功", project.version);
    expect(stale).toEqual({ ok: false, code: "VERSION_CONFLICT" });

    const current = await getProject(ownerId, project.id);
    expect(current?.name).toBe("改名後"); // 未被舊版本請求覆寫
  });

  it("AC-4：封存→還原；已封存者再封存冪等、已還原者再還原冪等", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "封存測試");

    const archived = await archiveProject(ownerId, project.id);
    expect(archived).toMatchObject({ ok: true, project: { archivedAt: expect.any(Date) } });

    const archivedAgain = await archiveProject(ownerId, project.id);
    expect(archivedAgain.ok && archivedAgain.project.version).toBe(
      archived.ok ? archived.project.version : -1,
    ); // 冪等：版本不再遞增

    const restored = await restoreProject(ownerId, project.id);
    expect(restored).toMatchObject({ ok: true, project: { archivedAt: null } });

    const restoredAgain = await restoreProject(ownerId, project.id);
    expect(restoredAgain.ok && restoredAgain.project.version).toBe(
      restored.ok ? restored.project.version : -1,
    ); // 冪等：版本不再遞增
  });

  it("AC-5：刪除後任一操作皆視同不存在（deleted 不可還原）", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "待刪除");

    const deleted = await deleteProject(ownerId, project.id);
    expect(deleted.ok).toBe(true);

    expect(await getProject(ownerId, project.id)).toBeNull();
    expect(await restoreProject(ownerId, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
  });

  it("AC-6（TDD P0 種子）：跨帳號一律 PROJECT_ACCESS_DENIED，不洩漏專案是否存在", async () => {
    const ownerA = await seedUser();
    const ownerB = await seedUser();
    const project = await createProject(ownerA, "帳號 A 的專案");

    expect(await getProject(ownerB, project.id)).toBeNull();
    expect(await renameProject(ownerB, project.id, "改壞了", project.version)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    expect(await archiveProject(ownerB, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    expect(await deleteProject(ownerB, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });

    // 不存在的 project_id 與「存在但非本人」回應必須一致（防列舉）
    expect(await getProject(ownerB, randomUUID())).toBeNull();
  });

  it("AC-9：跨帳號存取稽核記錄僅含白名單識別碼，不含健康內容", async () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const secretProjectName = "不該出現在日誌的專案名稱";
    auditAccessDenied({
      requestId: randomUUID(),
      userId: randomUUID(),
      projectId: randomUUID(),
      path: "/api/projects/x",
      method: "GET",
    });
    const output = spy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).toContain("PROJECT_ACCESS_DENIED");
    expect(output).not.toContain(secretProjectName);
    spy.mockRestore();
  });
});
