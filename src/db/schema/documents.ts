import { isNull } from "drizzle-orm";
import { date, integer, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { projects } from "./projects";

/**
 * E2-F1 健檔文件表（SDD §4.4；上游 §20／§22.3／§28.3；C12／C13）。
 * 本輪範圍止於「uploaded」——status 僅涵蓋 uploading／uploaded／upload_failed／
 * deleted 四種；processing/review_required/confirmed 屬 E2-F2/E2-F3，屆時擴充。
 * mimeType／sizeBytes／storageKey 於 complete 成功前為 null（上傳中無最終物件）。
 * reportDate（E3-F2，A45）：檢驗／報告日期，與 createdAt（上傳時間）語意分離，
 * 使用者選填；為 null 時趨勢圖 fallback 為 createdAt 並標記 dateEstimated。
 */
export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id),
    idempotencyKey: text("idempotency_key").notNull(),
    filename: text("filename").notNull(),
    mimeType: text("mime_type"),
    sizeBytes: integer("size_bytes"),
    storageKey: text("storage_key"),
    status: text("status").notNull().default("uploading"),
    reportDate: date("report_date"),
    version: integer("version").notNull().default(1),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    // 取消（軟刪除）後可用同一 idempotency key 重新上傳——唯一性只對未刪除紀錄生效
    uniqueIndex("documents_project_idempotency_unique")
      .on(table.projectId, table.idempotencyKey)
      .where(isNull(table.deletedAt)),
  ],
);
