import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { getDb, closePool } from "@/db/client";
import { users } from "@/db/schema";
import { createProject, deleteProject } from "@/modules/projects";
import { getProfile, upsertProfile } from "@/modules/profiles";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * 個人健康背景整合測試（E1-F5，AC-1～AC-8；連實庫）。
 * 測試帳號用 @projects.test.invalid 網域＋profile- 前綴（KB-019）。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `profile-${id}@projects.test.invalid` });
  return id;
}

describe.skipIf(!hasDb)("profiles module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("profile-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1：尚未建立時回 profile:null（合法初始狀態，非錯誤）", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "背景測試專案");

    const result = await getProfile(ownerId, project.id);
    expect(result).toEqual({ ok: true, profile: null });
  });

  it("AC-2／AC-7：首次建立 version=1；重新讀取（續編）內容一致", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "背景測試專案");

    const created = await upsertProfile(ownerId, project.id, { allergies: "花生" }, undefined);
    expect(created).toMatchObject({ ok: true, profile: { version: 1 } });

    const reread = await getProfile(ownerId, project.id);
    expect(reread.ok && reread.profile?.data).toEqual({ allergies: "花生" });
  });

  it("AC-3：帶正確 version 更新成功且 version+1；帶舊 version 回 VERSION_CONFLICT 不覆寫", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "背景測試專案");
    const created = await upsertProfile(ownerId, project.id, { allergies: "花生" }, undefined);
    if (!created.ok) throw new Error("setup failed");

    const updated = await upsertProfile(
      ownerId,
      project.id,
      { allergies: "花生、蝦" },
      created.profile.version,
    );
    expect(updated).toMatchObject({ ok: true, profile: { version: 2, data: { allergies: "花生、蝦" } } });

    const stale = await upsertProfile(
      ownerId,
      project.id,
      { allergies: "不該成功" },
      created.profile.version, // 已過期的版本號（1，目前實際是 2）
    );
    expect(stale).toEqual({ ok: false, code: "VERSION_CONFLICT" });

    const current = await getProfile(ownerId, project.id);
    expect(current.ok && current.profile?.data).toEqual({ allergies: "花生、蝦" });
  });

  it("AC-4：兩個自己名下的專案，背景資料互相隔離不混淆", async () => {
    const ownerId = await seedUser();
    const projectA = await createProject(ownerId, "專案 A");
    const projectB = await createProject(ownerId, "專案 B");

    await upsertProfile(ownerId, projectA.id, { allergies: "A 的過敏" }, undefined);

    const bProfile = await getProfile(ownerId, projectB.id);
    expect(bProfile).toEqual({ ok: true, profile: null }); // B 底下沒有 A 的資料

    const aProfile = await getProfile(ownerId, projectA.id);
    expect(aProfile.ok && aProfile.profile?.data).toEqual({ allergies: "A 的過敏" });
  });

  it("AC-5（TDD P0 種子延伸）：跨帳號一律 PROJECT_ACCESS_DENIED", async () => {
    const ownerA = await seedUser();
    const ownerB = await seedUser();
    const project = await createProject(ownerA, "帳號 A 的專案");
    await upsertProfile(ownerA, project.id, { allergies: "機密" }, undefined);

    expect(await getProfile(ownerB, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    expect(await upsertProfile(ownerB, project.id, { allergies: "竄改" }, 1)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
  });

  it("AC-6：專案已軟刪除後，背景一律視同不存在", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "將被刪除的專案");
    await upsertProfile(ownerId, project.id, { allergies: "資料" }, undefined);
    await deleteProject(ownerId, project.id);

    expect(await getProfile(ownerId, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
  });

  it("AC-8：日誌不含健康背景內容", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errorSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "日誌測試專案");
    const secretDetail = "不該出現在日誌的私密健康描述-XYZ123";

    await upsertProfile(ownerId, project.id, { allergies: secretDetail }, undefined);
    await getProfile(ownerId, project.id);

    const allOutput = [...spy.mock.calls, ...errorSpy.mock.calls, ...warnSpy.mock.calls]
      .map((call) => String(call[0]))
      .join("\n");
    expect(allOutput).not.toContain(secretDetail);
    spy.mockRestore();
    errorSpy.mockRestore();
    warnSpy.mockRestore();
  });
});
