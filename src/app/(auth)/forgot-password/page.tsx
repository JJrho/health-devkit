"use client";

import { useState } from "react";
import {
  AuthCard,
  FormMessage,
  SubmitButton,
  TextField,
} from "@/components/auth/auth-ui";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({ kind: null, text: "" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage({ kind: null, text: "" });
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email }),
      });
      if (response.ok) {
        setMessage({
          kind: "success",
          text: "如果這個 Email 有註冊過，我們已寄出重設密碼的信。請在 30 分鐘內點開信中連結完成重設。",
        });
      } else {
        const data = await response.json();
        setMessage({ kind: "error", text: data.error?.message ?? "發生問題，請再試一次。" });
      }
    } catch {
      setMessage({ kind: "error", text: "連線發生問題，請確認網路後再試一次。" });
    } finally {
      setPending(false);
    }
  }

  return (
    <AuthCard title="忘記密碼">
      <p className="mb-6 text-lg text-slate-700">
        請輸入您註冊時使用的 Email，我們會寄一封重設密碼的信給您。
      </p>
      <FormMessage kind={message.kind} text={message.text} />
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <SubmitButton pending={pending}>寄送重設信</SubmitButton>
      </form>
      <p className="mt-6 text-lg text-slate-700">
        <a href="/login" className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200">
          回到登入
        </a>
      </p>
    </AuthCard>
  );
}
