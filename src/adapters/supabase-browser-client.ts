"use client";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

/**
 * 瀏覽器端 Supabase client（僅用 anon/publishable key，設計上可安全暴露於前端）。
 *
 * 用途：密碼重設。免費方案未設定自訂 SMTP 前，Email 樣板無法自訂（KB-012），
 * 重設信一律走 Supabase 預設樣板＋implicit recovery flow（結果以網址 hash
 * 片段夾帶回站），因此重設密碼改在瀏覽器端完成（監聽 PASSWORD_RECOVERY
 * 事件、直接呼叫 updateUser），不再透過我們自己的後端 API。
 */
let client: SupabaseClient | undefined;

export function getSupabaseBrowserClient(): SupabaseClient {
  if (!client) {
    client = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    );
  }
  return client;
}
