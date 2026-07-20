import { inArray, like } from "drizzle-orm";
import { getDb } from "@/db/client";
import {
  checkIns,
  conversations,
  documents,
  extractedItemEdits,
  extractedItems,
  healthProfiles,
  interventionActions,
  interventionPlans,
  messageCitations,
  messages,
  observations,
  projects,
  sessions,
  symptomEvents,
  trackingMetrics,
  users,
} from "@/db/schema";

/**
 * 共用測試收尾清理（KB-019）：批次刪除（`inArray`），不逐列查詢——
 * 逐列刪除在大量資料（如配額測試灌 200 筆）下會讓 `afterAll` 逾時卡死。
 * `emailLikePattern` 務必包含各測試檔自己的前綴（如 `"doc-%@projects.test.invalid"`），
 * 不要用大範圍萬用字元，否則平行執行的測試檔會互相刪到對方尚在使用的資料。
 */
export async function cleanupTestData(emailLikePattern: string): Promise<void> {
  const db = getDb();
  const testUsers = await db
    .select({ id: users.id })
    .from(users)
    .where(like(users.email, emailLikePattern));
  const userIds = testUsers.map((user) => user.id);
  if (userIds.length === 0) return;

  const ownedProjects = await db
    .select({ id: projects.id })
    .from(projects)
    .where(inArray(projects.ownerId, userIds));
  const projectIds = ownedProjects.map((project) => project.id);

  if (projectIds.length > 0) {
    // E4-F3：message_citations 可能反向 FK 指向 observations，須在 observations 之前清掉
    // （KB-019 FK 順序教訓延續；conversations 直接掛 projectId，不依賴 docIds）
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
      .select({ id: documents.id })
      .from(documents)
      .where(inArray(documents.projectId, projectIds));
    const docIds = docs.map((doc) => doc.id);
    if (docIds.length > 0) {
      // observations 有 FK 指向 documents／extracted_items，須先刪（E2-F4，KB-019 FK 順序教訓延續）
      await db.delete(observations).where(inArray(observations.documentId, docIds));

      const items = await db
        .select({ id: extractedItems.id })
        .from(extractedItems)
        .where(inArray(extractedItems.documentId, docIds));
      const itemIds = items.map((item) => item.id);
      if (itemIds.length > 0) {
        // extracted_item_edits 有 FK 指向 extracted_items，須先刪（E2-F3，KB-019 FK 順序教訓延續）
        await db.delete(extractedItemEdits).where(inArray(extractedItemEdits.extractedItemId, itemIds));
      }
      await db.delete(extractedItems).where(inArray(extractedItems.documentId, docIds));
    }
    await db.delete(documents).where(inArray(documents.projectId, projectIds));
    await db.delete(healthProfiles).where(inArray(healthProfiles.projectId, projectIds));

    // E5-F1：intervention_actions／tracking_metrics 有 FK 指向 intervention_plans，須先刪
    const plans = await db
      .select({ id: interventionPlans.id })
      .from(interventionPlans)
      .where(inArray(interventionPlans.projectId, projectIds));
    const planIds = plans.map((p) => p.id);
    if (planIds.length > 0) {
      // E5-F2：check_ins 有 FK 指向 intervention_plans／tracking_metrics，須先刪
      await db.delete(checkIns).where(inArray(checkIns.planId, planIds));
      await db.delete(symptomEvents).where(inArray(symptomEvents.planId, planIds));
      await db.delete(interventionActions).where(inArray(interventionActions.planId, planIds));
      await db.delete(trackingMetrics).where(inArray(trackingMetrics.planId, planIds));
    }
    await db.delete(interventionPlans).where(inArray(interventionPlans.projectId, projectIds));
  }
  await db.delete(projects).where(inArray(projects.ownerId, userIds));
  await db.delete(sessions).where(inArray(sessions.userId, userIds));
  await db.delete(users).where(inArray(users.id, userIds));
}
