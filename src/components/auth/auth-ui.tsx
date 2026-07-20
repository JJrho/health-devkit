"use client";

/**
 * Auth 頁共用 UI（SDD §5 高齡優化：大字、高對比、少步驟、防重複提交；
 * 憲法 §5 無障礙基線：鍵盤可操作、focus 可見、狀態不只靠顏色）。
 */
import type { ReactNode } from "react";

export function AuthCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <div className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
        <h1 className="mb-6 text-3xl font-bold text-slate-900">{title}</h1>
        {children}
      </div>
    </main>
  );
}

export function TextField(props: {
  id: string;
  label: string;
  type: "email" | "password" | "text";
  value: string;
  onChange: (value: string) => void;
  autoComplete?: string;
  hint?: string;
}) {
  return (
    <div className="mb-5">
      <label htmlFor={props.id} className="mb-1 block text-lg font-medium text-slate-900">
        {props.label}
      </label>
      {props.hint ? (
        <p id={`${props.id}-hint`} className="mb-1 text-base text-slate-600">
          {props.hint}
        </p>
      ) : null}
      <input
        id={props.id}
        type={props.type}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        autoComplete={props.autoComplete}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
        className="w-full rounded-lg border-2 border-slate-400 px-4 py-3 text-lg text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
      />
    </div>
  );
}

export function TextareaField(props: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
}) {
  return (
    <div className="mb-5">
      <label htmlFor={props.id} className="mb-1 block text-lg font-medium text-slate-900">
        {props.label}
      </label>
      {props.hint ? (
        <p id={`${props.id}-hint`} className="mb-1 text-base text-slate-600">
          {props.hint}
        </p>
      ) : null}
      <textarea
        id={props.id}
        value={props.value}
        onChange={(event) => props.onChange(event.target.value)}
        aria-describedby={props.hint ? `${props.id}-hint` : undefined}
        rows={2}
        className="w-full rounded-lg border-2 border-slate-400 px-4 py-3 text-lg text-slate-900 focus:border-blue-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
      />
    </div>
  );
}

export function CheckboxField(props: {
  id: string;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <div className="mb-4 flex items-start gap-3">
      <input
        id={props.id}
        type="checkbox"
        checked={props.checked}
        onChange={(event) => props.onChange(event.target.checked)}
        className="mt-1 h-6 w-6 rounded border-2 border-slate-400 accent-blue-700 focus:ring-4 focus:ring-blue-200"
      />
      <label htmlFor={props.id} className="text-lg text-slate-900">
        {props.label}
      </label>
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  // 防重複提交：pending 期間停用並明示狀態（不只變色）
  return (
    <button
      type="submit"
      disabled={pending}
      className="w-full rounded-lg bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-400"
    >
      {pending ? "處理中，請稍候…" : children}
    </button>
  );
}

export function GoogleButton({
  onClick,
  disabled,
}: {
  onClick: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="mb-5 flex w-full items-center justify-center gap-3 rounded-lg border-2 border-slate-400 bg-white px-6 py-4 text-xl font-semibold text-slate-900 hover:bg-slate-50 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:text-slate-400"
    >
      使用 Google 登入
    </button>
  );
}

export function FormMessage({ kind, text }: { kind: "error" | "success" | null; text: string }) {
  if (!kind) return null;
  // aria-live：訊息更新時螢幕閱讀器會朗讀；圖示＋文字，不只靠顏色
  return (
    <p
      role="status"
      aria-live="polite"
      className={`mb-4 rounded-lg border-2 p-4 text-lg ${
        kind === "error"
          ? "border-red-300 bg-red-50 text-red-900"
          : "border-green-300 bg-green-50 text-green-900"
      }`}
    >
      {kind === "error" ? "⚠ " : "✓ "}
      {text}
    </p>
  );
}
