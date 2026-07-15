"use client";

import { useEffect, useState } from "react";
import {
  AuthCard,
  FormMessage,
  SubmitButton,
  TextField,
} from "@/components/auth/auth-ui";
import { getSupabaseBrowserClient } from "@/adapters/supabase-browser-client";

type LinkStatus = "checking" | "valid" | "invalid";

/**
 * 重設密碼頁（KB-012：改走 Supabase implicit recovery flow）。
 * 一進頁面即明確告知連結有效／無效，不讓使用者猜測狀態。
 */
export default function ResetPasswordPage() {
  const [linkStatus, setLinkStatus] = useState<LinkStatus>("checking");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({
    kind: null,
    text: "",
  });

  useEffect(() => {
    if (window.location.hash.includes("error=")) {
      setLinkStatus("invalid");
      return;
    }

    const supabase = getSupabaseBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setLinkStatus("valid");
    });

    // 若頁面重新整理，事件不會重發；主動查一次既有 session
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setLinkStatus((current) => (current === "checking" ? "valid" : current));
    });

    const timeout = setTimeout(() => {
      setLinkStatus((current) => (current === "checking" ? "invalid" : current));
    }, 4000);

    return () => {
      subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, []);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (password.length < 8) {
      setMessage({ kind: "error", text: "密碼長度至少需要 8 個字元。" });
      return;
    }
    setPending(true);
    setMessage({ kind: null, text: "" });
    try {
      const supabase = getSupabaseBrowserClient();
      const { error } = await supabase.auth.updateUser({ password });
      if (error) {
        setMessage({ kind: "error", text: "密碼設定失敗，請稍後再試一次。" });
      } else {
        setMessage({ kind: "success", text: "密碼已重設完成！請用新密碼重新登入。" });
        await supabase.auth.signOut(); // 不沿用 Supabase session，登入仍走本站 session（A9）
      }
    } catch {
      setMessage({ kind: "error", text: "連線發生問題，請確認網路後再試一次。" });
    } finally {
      setPending(false);
    }
  }

  const resetDone = message.kind === "success";

  return (
    <AuthCard title="設定新密碼">
      {linkStatus === "checking" && (
        <p className="mb-4 text-lg text-slate-700">正在驗證重設連結，請稍候…</p>
      )}

      {linkStatus === "invalid" && (
        <FormMessage
          kind="error"
          text="這個重設連結已過期或無效。請回到「忘記密碼」重新申請一封信，並在 30 分鐘內點開信中連結。"
        />
      )}

      {linkStatus === "valid" && (
        <>
          {!resetDone && (
            <FormMessage kind="success" text="連結驗證成功，請在下方設定您的新密碼。" />
          )}
          <FormMessage kind={message.kind} text={message.text} />
          {!resetDone && (
            <form onSubmit={handleSubmit} noValidate>
              <TextField
                id="new-password"
                label="新密碼"
                type="password"
                value={password}
                onChange={setPassword}
                autoComplete="new-password"
                hint="至少 8 個字元"
              />
              <SubmitButton pending={pending}>設定新密碼</SubmitButton>
            </form>
          )}
        </>
      )}

      <p className="mt-6 text-lg text-slate-700">
        <a
          href="/login"
          className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          回到登入
        </a>
      </p>
    </AuthCard>
  );
}
