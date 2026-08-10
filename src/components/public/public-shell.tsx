/**
 * 公開站五頁（E7-F1，A150）共用外殼：簡易頁首（站名連回首頁）＋簡易頁尾（四頁互連導覽）。
 * 純導覽結構，非 14_PUBLIC_SITE_COPY.md 規範的逐字文案內容。
 */
import type { ReactNode } from "react";
import Link from "next/link";

const NAV_LINKS = [
  { href: "/about", label: "產品說明" },
  { href: "/scope", label: "能做什麼・不能做什麼" },
  { href: "/privacy", label: "隱私與資料安全" },
  { href: "/ai-principles", label: "來源與 AI 原則" },
];

export function PublicHeader() {
  return (
    <header className="border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl items-center px-6 py-4">
        <Link
          href="/"
          className="text-lg font-bold text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          偵醫探心｜個人健康檢查管理平台
        </Link>
      </div>
    </header>
  );
}

export function PublicFooter() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <nav aria-label="公開站頁面導覽" className="mx-auto max-w-3xl px-6 py-6">
        <ul className="flex flex-wrap gap-x-6 gap-y-2">
          {NAV_LINKS.map((link) => (
            <li key={link.href}>
              <Link
                href={link.href}
                className="text-base text-slate-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                {link.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </footer>
  );
}

export function PublicPage({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <PublicHeader />
      <main className="mx-auto w-full max-w-3xl flex-1 px-6 py-12">{children}</main>
      <PublicFooter />
    </div>
  );
}

export function PageCta({ children }: { children: ReactNode }) {
  return <p className="mt-10 flex flex-wrap gap-x-2 gap-y-3 text-lg">{children}</p>;
}

export function PrimaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg bg-blue-700 px-6 py-3 font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
    >
      {children}
    </Link>
  );
}

export function SecondaryLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-lg border-2 border-blue-700 px-6 py-3 font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-300"
    >
      {children}
    </Link>
  );
}
