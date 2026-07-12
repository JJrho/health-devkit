"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  AuthCard,
  FormMessage,
  SubmitButton,
  TextField,
} from "@/components/auth/auth-ui";

function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const tokenHash = searchParams.get("token_hash") ?? "";
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({ kind: null, text: "" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage({ kind: null, text: "" });
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tokenHash, newPassword: password }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage({
          kind: "success",
          text: "密碼已重設完成！請用新密碼重新登入。",
        });
      } else {
        setMessage({ kind: "error", text: data.error?.message ?? "發生問題，請再試一次。" });
      }
    } catch {
      setMessage({ kind: "error", text: "連線發生問題，請確認網路後再試一次。" });
    } finally {
      setPending(false);
    }
  }

  if (!tokenHash) {
    return (
      <FormMessage
        kind="error"
        text="這個重設連結不完整。請從「忘記密碼」重新申請一封信，並直接點開信中的連結。"
      />
    );
  }

  return (
    <>
      <FormMessage kind={message.kind} text={message.text} />
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
      <p className="mt-6 text-lg text-slate-700">
        <a href="/login" className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200">
          回到登入
        </a>
      </p>
    </>
  );
}

export default function ResetPasswordPage() {
  return (
    <AuthCard title="設定新密碼">
      <Suspense>
        <ResetPasswordForm />
      </Suspense>
    </AuthCard>
  );
}
