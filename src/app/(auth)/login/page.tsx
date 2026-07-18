"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AuthCard,
  FormMessage,
  SubmitButton,
  TextField,
} from "@/components/auth/auth-ui";

export default function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({ kind: null, text: "" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage({ kind: null, text: "" });
    try {
      const response = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email, password }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage({
          kind: "success",
          text: data.emailVerified
            ? "登入成功！"
            : "登入成功！提醒您：您的 Email 尚未驗證，請點開驗證信完成驗證，之後才能上傳報告與使用 AI 問答。",
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

  return (
    <AuthCard title="登入">
      <FormMessage kind={message.kind} text={message.text} />
      {message.kind === "success" && (
        <Link
          href="/projects"
          className="mb-4 inline-block font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          前往我的健康專案
        </Link>
      )}
      <form onSubmit={handleSubmit} noValidate>
        <TextField
          id="email"
          label="Email"
          type="email"
          value={email}
          onChange={setEmail}
          autoComplete="email"
        />
        <TextField
          id="password"
          label="密碼"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="current-password"
        />
        <SubmitButton pending={pending}>登入</SubmitButton>
      </form>
      <div className="mt-6 flex flex-col gap-2 text-lg text-slate-700">
        <a href="/forgot-password" className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200">
          忘記密碼？
        </a>
        <p>
          還沒有帳號？{" "}
          <a href="/register" className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200">
            建立帳號
          </a>
        </p>
      </div>
    </AuthCard>
  );
}
