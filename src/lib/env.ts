/**
 * 環境變數讀取：集中管理、缺漏即早失敗。
 * 值一律來自 .env（不進 git）；範本見 .env.example。
 */
export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少環境變數 ${name}——請依 .env.example 建立本機 .env`);
  }
  return value;
}
