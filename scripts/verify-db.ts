import "dotenv/config";
import { getPool, closePool } from "@/db/client";

/**
 * AC-1 驗證輔助：檢查 pgvector 與 queue_jobs 目前狀態。
 */
async function main(): Promise<void> {
  const pool = getPool();
  const vector = await pool.query(
    `select 1 from pg_extension where extname = 'vector'`,
  );
  const table = await pool.query(
    `select to_regclass('public.queue_jobs') as t`,
  );
   
  console.log(
    `pgvector=${vector.rowCount === 1} queue_jobs=${table.rows[0].t !== null}`,
  );
  await closePool();
}

main().catch((error) => {
   
  console.error("verify 失敗：", error instanceof Error ? error.message : error);
  process.exit(1);
});
