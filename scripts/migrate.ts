import "dotenv/config";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { getDb, closePool } from "@/db/client";

/**
 * 套用 drizzle/ 內尚未執行的 migration（AC-1）。
 * 用法：pnpm db:migrate
 */
async function main(): Promise<void> {
  await migrate(getDb(), { migrationsFolder: "./drizzle" });
   
  console.log("✅ migration 全數套用完成");
  await closePool();
}

main().catch((error) => {
   
  console.error("❌ migration 失敗：", error instanceof Error ? error.message : error);
  process.exit(1);
});
