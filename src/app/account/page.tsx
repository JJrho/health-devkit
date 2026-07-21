"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { FormMessage } from "@/components/auth/auth-ui";

type LoadState = "loading" | "ready" | "unauthorized" | "error";

interface MeData {
  email: string;
  deletionRequestedAt: string | null;
}

const GRACE_DAYS = 30;

function formatDeletionDate(deletionRequestedAt: string): string {
  const requested = new Date(deletionRequestedAt);
  const scheduled = new Date(requested.getTime() + GRACE_DAYS * 24 * 60 * 60 * 1000);
  return scheduled.toLocaleDateString("zh-TW", { year: "numeric", month: "long", day: "numeric" });
}

/** E6-F1（C10）：帳號設定極簡頁——三十日冷靜期刪除申請／撤銷（A141：二次確認按鈕，不要求重新輸入密碼） */
export default function AccountPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [me, setMe] = useState<MeData | null>(null);
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({
    kind: null,
    text: "",
  });

  async function loadMe() {
    try {
      const response = await fetch("/api/auth/me");
      if (response.status === 401) {
        setLoadState("unauthorized");
        return;
      }
      if (!response.ok) {
        setLoadState("error");
        return;
      }
      const data = await response.json();
      setMe({ email: data.email, deletionRequestedAt: data.deletionRequestedAt });
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadMe();
  }, []);

  async function handleRequestDeletion() {
    if (pending) return;
    if (
      !window.confirm(
        "確定要刪除帳號嗎？您有 30 天的時間可以取消；30 天期滿後將永久刪除，無法復原。",
      )
    )
      return;
    setPending(true);
    setMessage({ kind: null, text: "" });
    try {
      const response = await fetch("/api/auth/me/deletion", { method: "POST" });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ kind: "error", text: data.error?.message ?? "申請失敗，請再試一次。" });
      } else {
        await loadMe();
        setMessage({ kind: "success", text: "已申請刪除帳號，30 天內可隨時取消。" });
      }
    } catch {
      setMessage({ kind: "error", text: "連線發生問題，請確認網路後再試一次。" });
    } finally {
      setPending(false);
    }
  }

  async function handleCancelDeletion() {
    if (pending) return;
    setPending(true);
    setMessage({ kind: null, text: "" });
    try {
      const response = await fetch("/api/auth/me/deletion", { method: "DELETE" });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ kind: "error", text: data.error?.message ?? "取消失敗，請再試一次。" });
      } else {
        await loadMe();
        setMessage({ kind: "success", text: "已取消刪除申請，帳號恢復正常。" });
      }
    } catch {
      setMessage({ kind: "error", text: "連線發生問題，請確認網路後再試一次。" });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">帳號設定</h1>

      {loadState === "loading" && <p className="text-lg text-slate-700">載入中…</p>}

      {loadState === "unauthorized" && (
        <>
          <FormMessage kind="error" text="請先登入才能查看帳號設定。" />
          <Link
            href="/login"
            className="mt-2 inline-block font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            前往登入
          </Link>
        </>
      )}

      {loadState === "error" && (
        <FormMessage kind="error" text="連線發生問題，請確認網路後重新整理頁面。" />
      )}

      {loadState === "ready" && me && (
        <>
          <FormMessage kind={message.kind} text={message.text} />

          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-2 text-xl font-semibold text-slate-900">帳號</h2>
            <p className="text-base text-slate-700">{me.email}</p>
          </section>

          {me.deletionRequestedAt ? (
            <section className="mb-8 rounded-2xl border-2 border-amber-400 bg-amber-50 p-6 shadow-sm">
              <h2 className="mb-2 text-xl font-semibold text-amber-900">帳號即將刪除</h2>
              <p className="mb-4 text-base text-amber-900">
                您的帳號將於 {formatDeletionDate(me.deletionRequestedAt)} 永久刪除。期滿後無法復原；
                您可以在此之前隨時取消。
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={handleCancelDeletion}
                className="rounded-lg bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:opacity-50"
              >
                取消刪除申請
              </button>
            </section>
          ) : (
            <section className="mb-8 rounded-2xl border border-red-200 bg-white p-6 shadow-sm">
              <h2 className="mb-2 text-xl font-semibold text-slate-900">刪除帳號</h2>
              <p className="mb-4 text-base text-slate-700">
                刪除後您有 30 天的時間可以取消；30 天期滿後系統將永久刪除您的所有專案、文件與資料，無法復原。
              </p>
              <button
                type="button"
                disabled={pending}
                onClick={handleRequestDeletion}
                className="rounded-lg border-2 border-red-400 px-6 py-4 text-xl font-semibold text-red-700 hover:bg-red-50 focus:outline-none focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                刪除帳號
              </button>
            </section>
          )}

          <Link
            href="/projects"
            className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            回我的健康專案
          </Link>
        </>
      )}
    </main>
  );
}
