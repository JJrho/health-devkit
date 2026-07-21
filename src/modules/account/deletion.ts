import { eq, inArray, sql } from "drizzle-orm";
import type { QueueAdapter, StorageAdapter } from "@/adapters";
import { getDb } from "@/db/client";
import {
  checkIns,
  consentRecords,
  conversations,
  documents,
  escalationSummaries,
  extractedItemEdits,
  extractedItems,
  healthProfiles,
  interventionActions,
  interventionPlans,
  messageCitations,
  messages,
  observations,
  planReviews,
  projects,
  sessions,
  symptomEvents,
  trackingMetrics,
  users,
} from "@/db/schema";
import { recordAuditEvent } from "@/modules/audit";

/** C10：帳號刪除三十日冷靜期（A135） */
const DELETION_GRACE_DAYS = 30;

/**
 * 申請刪除帳號（AC-1）。設定 deletionRequestedAt 並用既有 QueueAdapter
 * 的 runAt 延遲排程機制排入到期執行的永久刪除工作（A135，重用不新增基礎設施）。
 */
export async function requestAccountDeletion(
  queue: QueueAdapter,
  userId: string,
  requestId: string,
): Promise<{ deletionRequestedAt: Date }> {
  const db = getDb();
  const now = new Date();

  await db
    .update(users)
    .set({ deletionRequestedAt: now, updatedAt: now, version: sql`${users.version} + 1` })
    .where(eq(users.id, userId));

  const runAt = new Date(now.getTime() + DELETION_GRACE_DAYS * 24 * 60 * 60 * 1000);
  await queue.enqueue({ type: "delete-account", payload: { userId }, runAt });

  await recordAuditEvent(userId, "account_deletion_requested", { requestId });
  return { deletionRequestedAt: now };
}

/**
 * 撤銷刪除申請（AC-2）。不直接操作已排入的 queue_jobs 列（A136）——
 * 到期執行時由 permanentlyDeleteAccount() 自行重新檢查狀態。
 */
export async function cancelAccountDeletion(userId: string, requestId: string): Promise<void> {
  const db = getDb();
  await db
    .update(users)
    .set({ deletionRequestedAt: null, updatedAt: new Date(), version: sql`${users.version} + 1` })
    .where(eq(users.id, userId));
  await recordAuditEvent(userId, "account_deletion_cancelled", { requestId });
}

/**
 * 背景永久刪除（delete-account job handler 呼叫）。
 * A136：執行前重新查一次 deletionRequestedAt 是否仍非空，防撤銷競態；
 * 為空代表期間已撤銷，直接跳過不執行（回傳 deleted:false）。
 * A139：FK 刪除順序泛化自 tests/unit/helpers/cleanup-test-data.ts（Sprint 4–22
 * 反覆驗證），新增 Storage 物件真刪除步驟（測試輔助函式原本不做）；另補上
 * 該輔助函式遺漏、正式路徑不可省略的 consent_records 清理——consent_records
 * 對 users 的外鍵為 ON DELETE no action，若不先刪會讓刪除 users 本列失敗。
 */
export async function permanentlyDeleteAccount(
  storage: StorageAdapter,
  userId: string,
): Promise<{ deleted: boolean }> {
  const db = getDb();

  const rows = await db
    .select({ deletionRequestedAt: users.deletionRequestedAt })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  const user = rows[0];
  if (!user || !user.deletionRequestedAt) {
    return { deleted: false };
  }

  const ownedProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(eq(projects.ownerId, userId));
  const projectIds = ownedProjects.map((project) => project.id);

  if (projectIds.length > 0) {
    const convos = await db
      .select({ id: conversations.id })
      .from(conversations)
      .where(inArray(conversations.projectId, projectIds));
    const convoIds = convos.map((c) => c.id);
    if (convoIds.length > 0) {
      const msgs = await db
        .select({ id: messages.id })
        .from(messages)
        .where(inArray(messages.conversationId, convoIds));
      const msgIds = msgs.map((m) => m.id);
      if (msgIds.length > 0) {
        await db.delete(messageCitations).where(inArray(messageCitations.messageId, msgIds));
      }
      await db.delete(messages).where(inArray(messages.conversationId, convoIds));
      await db.delete(conversations).where(inArray(conversations.projectId, projectIds));
    }

    const docs = await db
      .select({ id: documents.id, storageKey: documents.storageKey })
      .from(documents)
      .where(inArray(documents.projectId, projectIds));
    const docIds = docs.map((doc) => doc.id);

    // A139 新增步驟：Storage 原始檔真刪除（AC-7），cleanupTestData 不做
    for (const doc of docs) {
      if (doc.storageKey) {
        await storage.deleteObject(doc.storageKey);
      }
    }

    if (docIds.length > 0) {
      await db.delete(observations).where(inArray(observations.documentId, docIds));

      const items = await db
        .select({ id: extractedItems.id })
        .from(extractedItems)
        .where(inArray(extractedItems.documentId, docIds));
      const itemIds = items.map((item) => item.id);
      if (itemIds.length > 0) {
        await db
          .delete(extractedItemEdits)
          .where(inArray(extractedItemEdits.extractedItemId, itemIds));
      }
      await db.delete(extractedItems).where(inArray(extractedItems.documentId, docIds));
    }
    await db.delete(documents).where(inArray(documents.projectId, projectIds));
    await db.delete(healthProfiles).where(inArray(healthProfiles.projectId, projectIds));

    const plans = await db
      .select({ id: interventionPlans.id })
      .from(interventionPlans)
      .where(inArray(interventionPlans.projectId, projectIds));
    const planIds = plans.map((plan) => plan.id);
    if (planIds.length > 0) {
      await db.delete(checkIns).where(inArray(checkIns.planId, planIds));
      await db.delete(symptomEvents).where(inArray(symptomEvents.planId, planIds));
      await db.delete(planReviews).where(inArray(planReviews.planId, planIds));
      await db.delete(escalationSummaries).where(inArray(escalationSummaries.planId, planIds));
      await db.delete(interventionActions).where(inArray(interventionActions.planId, planIds));
      await db.delete(trackingMetrics).where(inArray(trackingMetrics.planId, planIds));
    }
    await db.delete(interventionPlans).where(inArray(interventionPlans.projectId, projectIds));
  }

  await db.delete(projects).where(eq(projects.ownerId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(consentRecords).where(eq(consentRecords.userId, userId));
  await db.delete(users).where(eq(users.id, userId));

  // 帳號本列已刪除，稽核事件無外鍵（A138）可獨立存續
  await recordAuditEvent(userId, "account_deletion_completed", {});

  return { deleted: true };
}
