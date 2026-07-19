import { and, eq, isNull } from "drizzle-orm";
import { getDb } from "@/db/client";
import { conversations } from "@/db/schema";
import { findOwnedProject } from "@/modules/projects";

export type ConversationRow = typeof conversations.$inferSelect;

/** 四層鏈（A71）：第 1／2／4 層交給 findOwnedProject，第 3 層比對 conversation 屬於該 project。 */
export async function findOwnedConversation(
  userId: string,
  projectId: string,
  conversationId: string,
): Promise<ConversationRow | null> {
  const project = await findOwnedProject(userId, projectId);
  if (!project) return null;

  const rows = await getDb()
    .select()
    .from(conversations)
    .where(
      and(
        eq(conversations.id, conversationId),
        eq(conversations.projectId, project.id),
        isNull(conversations.deletedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}
