import { eq } from "drizzle-orm";
import { getDb } from "@/db/client";
import { users } from "@/db/schema";

/** C6：上傳／AI 鎖定至驗證完成——本輪首個消費此閘的功能（上傳） */
export async function isEmailVerified(userId: string): Promise<boolean> {
  const rows = await getDb()
    .select({ emailVerified: users.emailVerified })
    .from(users)
    .where(eq(users.id, userId))
    .limit(1);
  return rows[0]?.emailVerified ?? false;
}
