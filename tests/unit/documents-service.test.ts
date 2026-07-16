import { randomUUID } from "crypto";
import { afterAll, describe, expect, it, vi } from "vitest";
import { eq, like } from "drizzle-orm";
import { PDFDocument } from "pdf-lib";
import type { StorageAdapter } from "@/adapters";
import { getDb, closePool } from "@/db/client";
import { documents, healthProfiles, projects, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import {
  completeUpload,
  createUploadSession,
  deleteDocument,
  getPreviewUrl,
  listDocuments,
  uploadPart,
} from "@/modules/documents";
import { isEmailVerified } from "@/lib/require-verified-email";

/**
 * 文件上傳整合測試（E2-F1，AC-1～AC-11；連實庫，Storage 以記憶體假實作取代）。
 * 測試帳號沿用 @projects.test.invalid 網域（KB-019）。
 */
const hasDb = Boolean(process.env.DATABASE_URL);

class FakeStorageAdapter implements StorageAdapter {
  private store = new Map<string, Buffer>();

  async putObject(key: string, body: Buffer): Promise<void> {
    this.store.set(key, body);
  }
  async getObject(key: string): Promise<Buffer> {
    const value = this.store.get(key);
    if (!value) throw new Error(`not found: ${key}`);
    return value;
  }
  async getSignedDownloadUrl(key: string): Promise<string> {
    return `https://fake-storage.invalid/${key}?signed=1`;
  }
  async deleteObject(key: string): Promise<void> {
    this.store.delete(key);
  }
}

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `doc-${id}@projects.test.invalid` });
  return id;
}

async function makePdf(pageCount: number): Promise<Buffer> {
  const doc = await PDFDocument.create();
  for (let i = 0; i < pageCount; i++) doc.addPage();
  return Buffer.from(await doc.save());
}

function makePng(totalBytes = 100): Buffer {
  const header = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([header, Buffer.alloc(Math.max(0, totalBytes - header.length))]);
}

describe.skipIf(!hasDb)("documents module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    const db = getDb();
    const testUsers = await db
      .select({ id: users.id })
      .from(users)
      .where(like(users.email, "%@projects.test.invalid"));
    for (const user of testUsers) {
      const ownedProjects = await db
        .select({ id: projects.id })
        .from(projects)
        .where(eq(projects.ownerId, user.id));
      for (const project of ownedProjects) {
        await db.delete(documents).where(eq(documents.projectId, project.id));
        await db.delete(healthProfiles).where(eq(healthProfiles.projectId, project.id));
      }
      await db.delete(projects).where(eq(projects.ownerId, user.id));
      await db.delete(users).where(eq(users.id, user.id));
    }
    await closePool();
  });

  it("AC-1／AC-2（TDD 種子）：建立會話；同 idempotencyKey 重複提交回既有會話，不建立第二筆", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "文件測試專案");
    const key = randomUUID();

    const first = await createUploadSession(ownerId, project.id, {
      idempotencyKey: key,
      filename: "report.pdf",
    });
    expect(first).toMatchObject({ ok: true, document: { status: "uploading" } });

    const second = await createUploadSession(ownerId, project.id, {
      idempotencyKey: key,
      filename: "report.pdf",
    });
    expect(first.ok && second.ok && second.document.id).toBe(
      first.ok ? first.document.id : undefined,
    );

    const rows = await getDb().select().from(documents).where(eq(documents.projectId, project.id));
    expect(rows).toHaveLength(1);
  });

  it("AC-3：完整流程（建立→分段→complete）成功，PDF 內容通過驗證", async () => {
    const storage = new FakeStorageAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "文件測試專案");
    const session = await createUploadSession(ownerId, project.id, {
      idempotencyKey: randomUUID(),
      filename: "report.pdf",
    });
    if (!session.ok) throw new Error("setup failed");

    const pdfBytes = await makePdf(3);
    const partResult = await uploadPart(storage, ownerId, project.id, session.document.id, 1, pdfBytes);
    expect(partResult.ok).toBe(true);

    const completed = await completeUpload(storage, ownerId, project.id, session.document.id, 1);
    expect(completed).toMatchObject({
      ok: true,
      document: { status: "uploaded", mimeType: "application/pdf" },
    });
  });

  it("AC-4：偽造副檔名但內容不符（非 PDF/JPG/PNG）回 FILE_TYPE_NOT_SUPPORTED，狀態轉 upload_failed", async () => {
    const storage = new FakeStorageAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "文件測試專案");
    const session = await createUploadSession(ownerId, project.id, {
      idempotencyKey: randomUUID(),
      filename: "fake.pdf",
    });
    if (!session.ok) throw new Error("setup failed");

    const notAFile = Buffer.from("這只是一段純文字，不是任何合法格式的檔案內容");
    await uploadPart(storage, ownerId, project.id, session.document.id, 1, notAFile);
    const completed = await completeUpload(storage, ownerId, project.id, session.document.id, 1);
    expect(completed).toEqual({ ok: false, code: "FILE_TYPE_NOT_SUPPORTED" });

    const rows = await getDb()
      .select()
      .from(documents)
      .where(eq(documents.id, session.document.id));
    expect(rows[0]?.status).toBe("upload_failed");
  });

  it("AC-5：PDF 超過 30 頁回 FILE_TOO_LARGE", async () => {
    const storage = new FakeStorageAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "文件測試專案");
    const session = await createUploadSession(ownerId, project.id, {
      idempotencyKey: randomUUID(),
      filename: "too-many-pages.pdf",
    });
    if (!session.ok) throw new Error("setup failed");

    const pdfBytes = await makePdf(31);
    await uploadPart(storage, ownerId, project.id, session.document.id, 1, pdfBytes);
    const completed = await completeUpload(storage, ownerId, project.id, session.document.id, 1);
    expect(completed).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
  });

  it("AC-5：檔案超過 20MB 回 FILE_TOO_LARGE（PNG 內容合法但過大）", async () => {
    const storage = new FakeStorageAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "文件測試專案");
    const session = await createUploadSession(ownerId, project.id, {
      idempotencyKey: randomUUID(),
      filename: "huge.png",
    });
    if (!session.ok) throw new Error("setup failed");

    const oversized = makePng(21 * 1024 * 1024);
    await uploadPart(storage, ownerId, project.id, session.document.id, 1, oversized);
    const completed = await completeUpload(storage, ownerId, project.id, session.document.id, 1);
    expect(completed).toEqual({ ok: false, code: "FILE_TOO_LARGE" });
  }, 15000);

  it("失敗後換檔重試（同一會話）可成功完成", async () => {
    const storage = new FakeStorageAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "文件測試專案");
    const session = await createUploadSession(ownerId, project.id, {
      idempotencyKey: randomUUID(),
      filename: "retry.png",
    });
    if (!session.ok) throw new Error("setup failed");

    await uploadPart(storage, ownerId, project.id, session.document.id, 1, Buffer.from("bad"));
    const failed = await completeUpload(storage, ownerId, project.id, session.document.id, 1);
    expect(failed.ok).toBe(false);

    await uploadPart(storage, ownerId, project.id, session.document.id, 1, makePng());
    const retried = await completeUpload(storage, ownerId, project.id, session.document.id, 1);
    expect(retried).toMatchObject({ ok: true, document: { status: "uploaded" } });
  });

  it("AC-6：每專案 200 份文件上限，第 201 筆遭拒", async () => {
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "配額測試專案");
    const now = new Date();
    await getDb()
      .insert(documents)
      .values(
        Array.from({ length: 200 }, (_, index) => ({
          projectId: project.id,
          idempotencyKey: `bulk-${index}`,
          filename: `file-${index}.png`,
          status: "uploaded",
          createdAt: now,
          updatedAt: now,
        })),
      );

    const result = await createUploadSession(ownerId, project.id, {
      idempotencyKey: randomUUID(),
      filename: "the-201st.png",
    });
    expect(result).toEqual({ ok: false, code: "DOCUMENT_QUOTA_EXCEEDED" });
  }, 15000);

  it("AC-7（四層鏈第 3 層）：文件存在專案 A，用專案 B 的 id 一律 PROJECT_ACCESS_DENIED", async () => {
    const storage = new FakeStorageAdapter();
    const ownerId = await seedUser();
    const projectA = await createProject(ownerId, "專案 A");
    const projectB = await createProject(ownerId, "專案 B");
    const session = await createUploadSession(ownerId, projectA.id, {
      idempotencyKey: randomUUID(),
      filename: "a-only.png",
    });
    if (!session.ok) throw new Error("setup failed");

    expect(
      await uploadPart(storage, ownerId, projectB.id, session.document.id, 1, makePng()),
    ).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
    expect(
      await completeUpload(storage, ownerId, projectB.id, session.document.id, 1),
    ).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
    expect(await deleteDocument(storage, ownerId, projectB.id, session.document.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    const listB = await listDocuments(ownerId, projectB.id);
    expect(listB).toEqual({ ok: true, items: [] }); // B 底下本來就沒有文件，不是 A 的洩漏
  });

  it("AC-8：跨帳號一律 PROJECT_ACCESS_DENIED", async () => {
    const storage = new FakeStorageAdapter();
    const ownerA = await seedUser();
    const ownerB = await seedUser();
    const project = await createProject(ownerA, "帳號 A 的專案");
    const session = await createUploadSession(ownerA, project.id, {
      idempotencyKey: randomUUID(),
      filename: "secret.png",
    });
    if (!session.ok) throw new Error("setup failed");

    expect(await listDocuments(ownerB, project.id)).toEqual({
      ok: false,
      code: "PROJECT_ACCESS_DENIED",
    });
    expect(
      await getPreviewUrl(storage, ownerB, project.id, session.document.id),
    ).toEqual({ ok: false, code: "PROJECT_ACCESS_DENIED" });
  });

  it("isEmailVerified：正確反映 users.email_verified", async () => {
    const ownerId = await seedUser();
    expect(await isEmailVerified(ownerId)).toBe(false);
    await getDb().update(users).set({ emailVerified: true }).where(eq(users.id, ownerId));
    expect(await isEmailVerified(ownerId)).toBe(true);
  });

  it("AC-9：取消後可用同一 idempotencyKey 重新上傳成功", async () => {
    const storage = new FakeStorageAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "取消測試專案");
    const key = randomUUID();
    const session = await createUploadSession(ownerId, project.id, {
      idempotencyKey: key,
      filename: "cancel-me.png",
    });
    if (!session.ok) throw new Error("setup failed");

    const cancelled = await deleteDocument(storage, ownerId, project.id, session.document.id);
    expect(cancelled).toMatchObject({ ok: true, document: { status: "deleted" } });

    const retried = await createUploadSession(ownerId, project.id, {
      idempotencyKey: key,
      filename: "cancel-me.png",
    });
    expect(retried.ok && retried.document.id).not.toBe(session.document.id);
  });

  it("AC-10：已上傳文件回短效 signed URL", async () => {
    const storage = new FakeStorageAdapter();
    const ownerId = await seedUser();
    const project = await createProject(ownerId, "預覽測試專案");
    const session = await createUploadSession(ownerId, project.id, {
      idempotencyKey: randomUUID(),
      filename: "preview.png",
    });
    if (!session.ok) throw new Error("setup failed");
    await uploadPart(storage, ownerId, project.id, session.document.id, 1, makePng());
    await completeUpload(storage, ownerId, project.id, session.document.id, 1);

    const preview = await getPreviewUrl(storage, ownerId, project.id, session.document.id);
    expect(preview.ok && preview.url).toContain("signed=1");
  });

  it("AC-11：稽核記錄不含檔名等內容，只有識別碼", async () => {
    const storage = new FakeStorageAdapter();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const ownerA = await seedUser();
    const ownerB = await seedUser();
    const project = await createProject(ownerA, "日誌測試專案");
    const secretFilename = "不該出現在日誌的病歷檔名-XYZ.pdf";
    const session = await createUploadSession(ownerA, project.id, {
      idempotencyKey: randomUUID(),
      filename: secretFilename,
    });
    if (!session.ok) throw new Error("setup failed");

    await getPreviewUrl(storage, ownerB, project.id, session.document.id);
    // service 本身不記 log（由 route 層呼叫 auditAccessDenied），此處驗證 service 呼叫過程未意外印出檔名
    const output = warnSpy.mock.calls.map((call) => String(call[0])).join("\n");
    expect(output).not.toContain(secretFilename);
    warnSpy.mockRestore();
  });
});
