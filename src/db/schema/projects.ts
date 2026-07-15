import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";

/**
 * E1-F4 健康專案表（SDD §4.2／§7；本案安全基線）。
 * 狀態不用獨立 enum 欄位——沿用 users 表慣例，以 archivedAt／deletedAt 是否為 null 推導
 * active／archived／deleted（未刪除即 deletedAt is null）。
 * RLS 政策見對應 migration（ENABLE ROW LEVEL SECURITY＋owner_id 政策）：
 * 目前連線角色（Supabase postgres，BYPASSRLS）尚無法被政策實際擋下，
 * 政策僅先就緒；四層權限鏈（src/modules/projects）是本輪真正生效的防線。
 */
export const projects = pgTable(
  "projects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id),
    name: text("name").notNull(),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    lastAccessedAt: timestamp("last_accessed_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
    archivedAt: timestamp("archived_at", { withTimezone: true }),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [index("projects_owner_id_idx").on(table.ownerId)],
);
