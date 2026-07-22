import { randomUUID } from "crypto";
import { and, eq } from "drizzle-orm";
import { afterAll, describe, expect, it, vi } from "vitest";
import type {
  AuthAdapter,
  AuthUser,
  ClaimedJob,
  EnqueueInput,
  QueueAdapter,
  QueueJobView,
  StorageAdapter,
} from "@/adapters";
import { getDb, closePool } from "@/db/client";
import { auditEvents, conversations, documents, projects, users } from "@/db/schema";
import { createProject } from "@/modules/projects";
import { recordAuditEvent } from "@/modules/audit";
import { auditAccessDenied } from "@/modules/projects";
import {
  cancelAccountDeletion,
  permanentlyDeleteAccount,
  requestAccountDeletion,
} from "@/modules/account/deletion";
import { cleanupTestData } from "./helpers/cleanup-test-data";

/**
 * E6-F1 整合測試（Sprint 23，AC-1～AC-8／AC-10；連實庫）。
 * 測試帳號用 @projects.test.invalid 網域＋acct- 前綴（KB-019）。
 * AC-9（UI）為瀏覽器驗證範圍，不在此檔涵蓋；AC-8（未登入保護）由 requireSession()
 * 於路由層統一把關，與既有其他 Feature 一致，本檔聚焦模組層邏輯。
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
  has(key: string): boolean {
    return this.store.has(key);
  }
}

class FakeAuthAdapter implements AuthAdapter {
  deletedUserIds: string[] = [];
  async register(): Promise<{ userId: string } | "EMAIL_EXISTS" | "INVALID_EMAIL" | "EMAIL_RATE_LIMITED"> {
    throw new Error("not implemented");
  }
  async verifyPassword() {
    return null;
  }
  async sendPasswordReset(): Promise<void> {}
  async getUserById(): Promise<AuthUser | null> {
    return null;
  }
  async verifyGoogleToken() {
    return "AUTH_GOOGLE_FAILED" as const;
  }
  async deleteUser(userId: string): Promise<void> {
    this.deletedUserIds.push(userId);
  }
}

class FakeQueueAdapter implements QueueAdapter {
  enqueued: EnqueueInput[] = [];
  async enqueue(input: EnqueueInput): Promise<{ id: string }> {
    this.enqueued.push(input);
    return { id: randomUUID() };
  }
  async claimNext(): Promise<ClaimedJob | null> {
    return null;
  }
  async complete(): Promise<void> {}
  async fail(): Promise<void> {}
  async getJob(): Promise<QueueJobView | null> {
    return null;
  }
}

async function seedUser(): Promise<string> {
  const id = randomUUID();
  await getDb().insert(users).values({ id, email: `acct-${id}@projects.test.invalid` });
  return id;
}

async function getUserRow(userId: string) {
  const rows = await getDb().select().from(users).where(eq(users.id, userId)).limit(1);
  return rows[0] ?? null;
}

async function getAuditEvents(userId: string, eventType: string) {
  return getDb()
    .select()
    .from(auditEvents)
    .where(and(eq(auditEvents.userId, userId), eq(auditEvents.eventType, eventType)));
}

describe.skipIf(!hasDb)("account deletion module（整合，需 DATABASE_URL）", () => {
  afterAll(async () => {
    await cleanupTestData("acct-%@projects.test.invalid");
    await closePool();
  });

  it("AC-1（申請刪除成功）：deletionRequestedAt 設定，稽核事件寫入，背景工作以 runAt≈+30天排入", async () => {
    const userId = await seedUser();
    const queue = new FakeQueueAdapter();
    const before = Date.now();

    const result = await requestAccountDeletion(queue, userId, "req-1");

    const user = await getUserRow(userId);
    expect(user!.deletionRequestedAt).not.toBeNull();
    expect(result.deletionRequestedAt.getTime()).toBeGreaterThanOrEqual(before);

    expect(queue.enqueued).toHaveLength(1);
    expect(queue.enqueued[0]!.type).toBe("delete-account");
    expect(queue.enqueued[0]!.payload).toEqual({ userId });
    const runAt = queue.enqueued[0]!.runAt!;
    const expectedRunAt = before + 30 * 24 * 60 * 60 * 1000;
    expect(Math.abs(runAt.getTime() - expectedRunAt)).toBeLessThan(60_000);

    const events = await getAuditEvents(userId, "account_deletion_requested");
    expect(events).toHaveLength(1);
  });

  it("AC-2（撤銷申請成功）：deletionRequestedAt 清空，稽核事件寫入", async () => {
    const userId = await seedUser();
    const queue = new FakeQueueAdapter();
    await requestAccountDeletion(queue, userId, "req-2a");

    await cancelAccountDeletion(userId, "req-2b");

    const user = await getUserRow(userId);
    expect(user!.deletionRequestedAt).toBeNull();

    const events = await getAuditEvents(userId, "account_deletion_cancelled");
    expect(events).toHaveLength(1);
  });

  it("AC-3（背景工作到期執行，真刪除）：帳號名下專案／users 本列皆確實刪除", async () => {
    const userId = await seedUser();
    const queue = new FakeQueueAdapter();
    const storage = new FakeStorageAdapter();
    const auth = new FakeAuthAdapter();
    await createProject(userId, "待刪除專案");
    await requestAccountDeletion(queue, userId, "req-3");

    const result = await permanentlyDeleteAccount(storage, auth, userId);
    expect(result.deleted).toBe(true);

    const user = await getUserRow(userId);
    expect(user).toBeNull();
    const remainingProjects = await getDb()
      .select()
      .from(projects)
      .where(eq(projects.ownerId, userId));
    expect(remainingProjects).toEqual([]);
    // 正式站部署驗證發現並修正的缺陷：僅刪本地 users 列不夠，Auth 身分也須刪除
    expect(auth.deletedUserIds).toEqual([userId]);
  });

  it("AC-4（撤銷後不誤刪，防競態）：即使原排程時間已到，重新檢查發現已撤銷則跳過", async () => {
    const userId = await seedUser();
    const queue = new FakeQueueAdapter();
    const storage = new FakeStorageAdapter();
    const auth = new FakeAuthAdapter();
    await requestAccountDeletion(queue, userId, "req-4a");
    await cancelAccountDeletion(userId, "req-4b");

    const result = await permanentlyDeleteAccount(storage, auth, userId);
    expect(result.deleted).toBe(false);

    const user = await getUserRow(userId);
    expect(user).not.toBeNull();
    expect(auth.deletedUserIds).toEqual([]);
  });

  it("AC-5（跨帳號存取稽核落地）：audit_events 新增一列 project_access_denied，非僅 console 日誌", async () => {
    const userId = await seedUser();
    const projectId = randomUUID();

    auditAccessDenied({
      requestId: "req-5",
      userId,
      projectId,
      path: `/api/projects/${projectId}`,
      method: "GET",
    });
    // fire-and-forget：等待微任務完成寫入
    await new Promise((resolve) => setTimeout(resolve, 50));

    const events = await getAuditEvents(userId, "project_access_denied");
    expect(events).toHaveLength(1);
    expect(events[0]!.metadata).toMatchObject({ projectId, path: `/api/projects/${projectId}`, method: "GET" });
  });

  it("AC-6（稽核事件不含健康內容）：metadata 僅含白名單結構化欄位", async () => {
    const userId = await seedUser();
    await recordAuditEvent(userId, "account_deletion_requested", {
      requestId: "req-6",
      projectId: randomUUID(),
    });

    const events = await getAuditEvents(userId, "account_deletion_requested");
    expect(events).toHaveLength(1);
    const keys = Object.keys(events[0]!.metadata as Record<string, unknown>).sort();
    expect(keys).toEqual(["projectId", "requestId"]);
  });

  it("AC-7（Storage 真刪除）：帳號名下已上傳文件對應 Storage 物件於永久刪除後不存在", async () => {
    const userId = await seedUser();
    const queue = new FakeQueueAdapter();
    const storage = new FakeStorageAdapter();
    const auth = new FakeAuthAdapter();
    const project = await createProject(userId, "含文件的待刪除專案");
    const storageKey = `documents/${randomUUID()}/report.pdf`;
    await storage.putObject(storageKey, Buffer.from("fake pdf content"));
    await getDb().insert(documents).values({
      projectId: project.id,
      idempotencyKey: randomUUID(),
      filename: "report.pdf",
      mimeType: "application/pdf",
      sizeBytes: 17,
      storageKey,
      status: "uploaded",
    });
    expect(storage.has(storageKey)).toBe(true);
    await requestAccountDeletion(queue, userId, "req-7");

    await permanentlyDeleteAccount(storage, auth, userId);

    expect(storage.has(storageKey)).toBe(false);
    await expect(storage.getObject(storageKey)).rejects.toThrow();
  });

  it("AC-3 補充：對話與訊息等從屬資料連帶清除，不留孤兒列", async () => {
    const userId = await seedUser();
    const queue = new FakeQueueAdapter();
    const storage = new FakeStorageAdapter();
    const auth = new FakeAuthAdapter();
    const project = await createProject(userId, "含對話的待刪除專案");
    await getDb().insert(conversations).values({ projectId: project.id, title: "測試對話" });
    await requestAccountDeletion(queue, userId, "req-3b");

    await permanentlyDeleteAccount(storage, auth, userId);

    const remainingConvos = await getDb()
      .select()
      .from(conversations)
      .where(eq(conversations.projectId, project.id));
    expect(remainingConvos).toEqual([]);
  });

  it("AC-10（日誌 P0）：刪除鏈全流程不將健康內容或 token 寫入 console", async () => {
    const spy = vi.spyOn(console, "log").mockImplementation(() => {});
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const userId = await seedUser();
    const queue = new FakeQueueAdapter();
    const storage = new FakeStorageAdapter();
    const auth = new FakeAuthAdapter();
    const marker = `acct-log-marker-${randomUUID()}`;
    const project = await createProject(userId, marker);

    await requestAccountDeletion(queue, userId, "req-10");
    await cancelAccountDeletion(userId, "req-10b");
    await requestAccountDeletion(queue, userId, "req-10c");
    await permanentlyDeleteAccount(storage, auth, userId);

    const allOutput = [...spy.mock.calls, ...errSpy.mock.calls]
      .map((call) => String(call[0]))
      .join("\n");
    expect(allOutput).not.toContain(marker);
    void project;
    spy.mockRestore();
    errSpy.mockRestore();
  });
});
