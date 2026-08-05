import type { Metadata } from "next";
import Link from "next/link";
import { PublicFooter, PublicHeader } from "@/components/public/public-shell";

/**
 * 公開站 Hero 首頁（E7-F1，取代過渡版）。文字內容逐字採用
 * 14_PUBLIC_SITE_COPY.md 頁 4/5，不重寫不潤飾。og:image 本輪暫不提供（A151）。
 */
export const metadata: Metadata = {
  title: "個人健康檢查管理平台｜把健檢報告變成看得懂的健康紀錄",
  description:
    "整理歷年健檢資料、追蹤長期趨勢、建立可以安心調整的健康行動計畫。不診斷、不開藥、不用命理。",
  openGraph: {
    title: "個人健康檢查管理平台｜把健檢報告變成看得懂的健康紀錄",
    description:
      "整理歷年健檢資料、追蹤長期趨勢、建立可以安心調整的健康行動計畫。不診斷、不開藥、不用命理。",
  },
};

const TRUST_BLOCKS = [
  {
    icon: "🔒",
    text: "「你的健康資料只有你看得到，不會拿去訓練 AI，也不會外流給第三方。」",
    label: "隱私與資料安全",
    href: "/privacy",
  },
  {
    icon: "✅",
    text: "「能做什麼、不能做什麼，這裡說清楚。」",
    label: "能做什麼・不能做什麼",
    href: "/scope",
  },
  {
    icon: "📎",
    text: "「AI 的每一句健康說明都附上出處，可以自己查證。」",
    label: "來源與AI原則",
    href: "/ai-principles",
  },
] as const;

export default function HomePage() {
  return (
    <div className="flex min-h-screen flex-col bg-slate-50">
      <PublicHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col items-center gap-6 px-6 py-16 text-center">
        <h1 className="text-4xl font-bold text-slate-900">把多年健檢報告，變成看得懂的健康紀錄</h1>
        <p className="max-w-xl text-xl text-slate-700" data-testid="skeleton-status">
          不做診斷、不開藥、不用命理——用你自己的資料，陪你一步步看懂身體的長期變化。
        </p>
        <div className="flex gap-4">
          <Link
            href="/register"
            className="rounded-lg bg-blue-700 px-8 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            建立帳號
          </Link>
          <Link
            href="/login"
            className="rounded-lg border-2 border-blue-700 px-8 py-4 text-xl font-semibold text-blue-700 hover:bg-blue-50 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            登入
          </Link>
        </div>

        <ul className="mt-10 grid w-full gap-4 text-left sm:grid-cols-3">
          {TRUST_BLOCKS.map((block) => (
            <li key={block.href}>
              <Link
                href={block.href}
                className="flex h-full flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm hover:border-blue-300 focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <span aria-hidden="true" className="text-2xl">
                  {block.icon}
                </span>
                <p className="text-base text-slate-800">{block.text}</p>
                <span className="mt-auto text-sm font-semibold text-blue-700 underline">
                  {block.label}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </main>
      <PublicFooter />
    </div>
  );
}
