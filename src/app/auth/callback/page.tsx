"use client";

import { useEffect, useRef, useState } from "react";
import { getSupabaseBrowserClient } from "@/adapters/supabase-browser-client";

type Status = "checking" | "error";

const CONSENT_STORAGE_KEY = "hd_google_consent";

/**
 * Google 登入回呼頁（E1-F3；A122）。
 * Supabase OAuth 導向完成後帶著 access_token 回到本頁，取得後 POST 給
 * 自己的後端驗證＋建立本系統 session，成功即捨棄 Supabase 瀏覽器端 session
 * （比照既有 reset-password 頁的 onAuthStateChange＋getSession 回退模式）。
 */
export default function AuthCallbackPage() {
  const [status, setStatus] = useState<Status>("checking");
  const [message, setMessage] = useState("正在完成 Google 登入，請稍候…");
  const handledRef = useRef(false);

  useEffect(() => {
    const supabase = getSupabaseBrowserClient();

    async function finish(accessToken: string) {
      if (handledRef.current) return;
      handledRef.current = true;

      let consent: { agreeTermsAndDisclaimer?: boolean; declareAge18?: boolean } = {};
      try {
        const raw = sessionStorage.getItem(CONSENT_STORAGE_KEY);
        if (raw) consent = JSON.parse(raw);
      } catch {
        // 解析失敗視同未附同意，交由後端判定
      }
      sessionStorage.removeItem(CONSENT_STORAGE_KEY);

      let response: Response;
      try {
        response = await fetch("/api/auth/google", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ accessToken, ...consent }),
        });
      } catch {
        await supabase.auth.signOut({ scope: "local" });
        setStatus("error");
        setMessage("連線發生問題，請確認網路後再試一次。");
        return;
      }

      // A122：本系統 session 建立與否已定案，Supabase 瀏覽器端 session 即可捨棄
      await supabase.auth.signOut({ scope: "local" });

      if (response.ok) {
        window.location.href = "/projects";
        return;
      }

      const body = await response.json().catch(() => null);
      if (body?.error?.code === "CONSENT_REQUIRED") {
        setStatus("error");
        setMessage("第一次使用 Google 登入前，請先至建立帳號頁閱讀並勾選服務條款與醫療免責聲明。");
        setTimeout(() => {
          window.location.href = "/register";
        }, 2500);
        return;
      }
      setStatus("error");
      setMessage(body?.error?.message ?? "Google 登入未完成，請重新嘗試。");
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_IN" && session?.access_token) {
        finish(session.access_token);
      }
    });

    // 若頁面重新整理或事件已錯過，主動查一次既有 session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session?.access_token) finish(data.session.access_token);
    });

    const timeout = setTimeout(() => {
      if (!handledRef.current) {
        handledRef.current = true;
        setStatus("error");
        setMessage("Google 登入未完成，請重新嘗試。");
      }
    }, 8000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <h1 className="mb-4 text-3xl font-bold text-slate-900">
          {status === "error" ? "⚠ 登入未完成" : "登入中…"}
        </h1>
        <p className="mb-6 text-lg text-slate-700">{message}</p>
        {status === "error" && (
          <a
            href="/login"
            className="inline-block rounded-lg bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            回登入頁
          </a>
        )}
      </div>
    </main>
  );
}
