import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { requireEnv } from "@/lib/env";
import * as schema from "./schema";

/**
 * DB 連線（Supabase 東京，pooler 連線字串）。
 * 單例 Pool：Web 與 Worker 各自進程各持一份。
 */
let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: requireEnv("DATABASE_URL"),
      max: 10,
    });
  }
  return pool;
}

export function getDb() {
  return drizzle(getPool(), { schema });
}

/** 測試與 Worker 收尾用 */
export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = undefined;
  }
}
