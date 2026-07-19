import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

/**
 * E4-F3 對話表（SDD §4.9；上游 §22.5／§23）。
 * 四層權限鏈第 3 層「資源屬於專案」在此生效；messages／message_citations
 * 透過 conversationId 間接歸屬（A71）。title 本輪不強制，前端可自行從首則
 * 訊息摘要，本輪不做自動摘要邏輯。
 */
export const conversations = pgTable(
  "conversations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    title: text("title"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("conversations_project_id_idx").on(table.projectId)],
);
