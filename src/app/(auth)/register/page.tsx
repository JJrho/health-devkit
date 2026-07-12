"use client";

import { useState } from "react";
import {
  AuthCard,
  CheckboxField,
  FormMessage,
  SubmitButton,
  TextField,
} from "@/components/auth/auth-ui";

/** 佔位條款（A10：未經法律審查之預覽版；正式版經審查後換入並遞增 consent 版本） */
const PLACEHOLDER_TERMS = `【預覽版條款——尚未經法律審查】

1. 本平台協助您整理與追蹤自己的健康檢查資料，不提供疾病診斷、用藥或停藥建議。
2. 平台上的所有內容僅供參考，任何健康決定請與您的醫師或專業人員討論。
3. 您的健康資料僅屬於您本人；未經您的同意，我們不會用於其他用途。
4. 正式版服務條款與隱私政策將於法律審查完成後更新，屆時會再次請您確認。`;

export default function RegisterPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [agreeTerms, setAgreeTerms] = useState(false);
  const [age18, setAge18] = useState(false);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({ kind: null, text: "" });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    setMessage({ kind: null, text: "" });
    try {
      const response = await fetch("/api/auth/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          email,
          password,
          agreeTermsAndDisclaimer: agreeTerms,
          declareAge18: age18,
        }),
      });
      const data = await response.json();
      if (response.ok) {
        setMessage({
          kind: "success",
          text: "註冊完成！我們已寄出一封驗證信到您的信箱，請點開信中的連結完成驗證。現在也可以直接登入。",
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
    <AuthCard title="建立帳號">
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
        <TextField
          id="password"
          label="密碼"
          type="password"
          value={password}
          onChange={setPassword}
          autoComplete="new-password"
          hint="至少 8 個字元"
        />
        <div className="mb-4">
          <p className="mb-1 text-lg font-medium text-slate-900">服務條款與醫療免責聲明</p>
          <textarea
            readOnly
            value={PLACEHOLDER_TERMS}
            aria-label="服務條款與醫療免責聲明內容"
            className="h-40 w-full rounded-lg border-2 border-slate-300 bg-slate-50 p-3 text-base text-slate-800"
          />
        </div>
        <CheckboxField
          id="agree-terms"
          checked={agreeTerms}
          onChange={setAgreeTerms}
          label="我已閱讀並同意上方的服務條款與醫療免責聲明"
        />
        <CheckboxField
          id="age-18"
          checked={age18}
          onChange={setAge18}
          label="我已年滿 18 歲"
        />
        <SubmitButton pending={pending}>建立帳號</SubmitButton>
      </form>
      <p className="mt-6 text-lg text-slate-700">
        已經有帳號了？{" "}
        <a href="/login" className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200">
          前往登入
        </a>
      </p>
    </AuthCard>
  );
}
