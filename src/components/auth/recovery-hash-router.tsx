"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { getSupabaseBrowserClient } from "@/adapters/supabase-browser-client";

/**
 * 全域攔截 Supabase 密碼重設的 implicit hash 回跳（KB-012）。
 *
 * 免費方案未設定自訂 SMTP 無法自訂 Email 樣板，重設信一律用 Supabase 預設
 * 樣板＋hash 片段跳轉；實際落地頁面不保證是 /reset-password（可能是 Site URL
 * 根目錄），故在根 layout 全域監聽，偵測到即導向 /reset-password 統一呈現。
 */
export function RecoveryHashRouter() {
  const router = useRouter();
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (window.location.hash.includes("error=") && pathname !== "/reset-password") {
      router.replace(`/reset-password${window.location.hash}`);
      return;
    }

    const supabase = getSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" && pathname !== "/reset-password") {
        router.replace("/reset-password");
      }
    });

    return () => subscription.unsubscribe();
  }, [pathname, router]);

  return null;
}
