import "dotenv/config";
import { readFileSync } from "fs";
import { join } from "path";
import { getPool, closePool } from "@/db/client";

/**
 * 回滾「最後一個已套用」的 migration（AC-1）。
 * 機制：讀 drizzle/meta/_journal.json 取最後 tag → 執行 drizzle/down/<tag>.down.sql
 * → 移除 drizzle.__drizzle_migrations 之最後一筆紀錄。
 * 用法：pnpm db:rollback
 */
async function main(): Promise<void> {
  const journal = JSON.parse(
    readFileSync(join(process.cwd(), "drizzle", "meta", "_journal.json"), "utf8"),
  ) as { entries: Array<{ tag: string }> };

  const last = journal.entries.at(-1);
  if (!last) {
     
    console.log("沒有可回滾的 migration");
    return;
  }

  const downSql = readFileSync(
    join(process.cwd(), "drizzle", "down", `${last.tag}.down.sql`),
    "utf8",
  );

  const pool = getPool();
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    for (const statement of downSql.split("--> statement-breakpoint")) {
      const sql = statement.trim();
      if (sql) await client.query(sql);
    }
    await client.query(
      `DELETE FROM drizzle.__drizzle_migrations
       WHERE id = (SELECT id FROM drizzle.__drizzle_migrations ORDER BY created_at DESC, id DESC LIMIT 1)`,
    );
    await client.query("COMMIT");
     
    console.log(`✅ 已回滾 migration：${last.tag}`);
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
  await closePool();
}

main().catch((error) => {
   
  console.error("❌ 回滾失敗：", error instanceof Error ? error.message : error);
  process.exit(1);
});
