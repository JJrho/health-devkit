import type { Metadata } from "next";
import { PageCta, PrimaryLink, PublicPage } from "@/components/public/public-shell";

/**
 * 公開站「產品說明」頁（E7-F1）。文字逐字採用
 * 14_PUBLIC_SITE_COPY.md 頁 3/5，不重寫不潤飾。
 */
export const metadata: Metadata = {
  title: "產品說明｜個人健康檢查管理平台",
  description: "陪你把健檢報告，變成看得懂的健康紀錄。",
};

const STEPS = [
  "建立你的健康專案",
  "上傳這幾年的健檢報告（拍照或掃描檔都可以）",
  "系統先自動讀出上面的數字，你再親自核對確認一次",
  "確認後才會正式列入你的健康紀錄",
  "打開「健康戰情」，看到整理好的長期趨勢",
  "有疑問時，用有來源根據的問答功能查詢",
  "想調整生活習慣的話，可以訂一個行動計畫，定期回報、定期檢討",
];

export default function AboutPage() {
  return (
    <PublicPage>
      <h1 className="text-4xl font-bold text-slate-900">陪你把健檢報告，變成看得懂的健康紀錄</h1>

      <div className="mt-8 flex flex-col gap-6 text-lg text-slate-800">
        <p>
          每年健檢完，報告通常就是一份 PDF 或幾張紙，放進抽屜，直到明年健檢前才會再想起來。這個平台想解決的就是這件事——把你這些年累積的健檢資料，整理成一份看得懂、走勢清楚的健康紀錄，而不是一堆分散、沒人回頭看的舊報告。
        </p>
        <p>
          特別是如果你已經累積好幾年的健檢報告、想知道「這些數字到底在往哪個方向走」，這個平台會是一個安靜、持續在背後幫你整理的工具。
        </p>
      </div>

      <section className="mt-10">
        <h2 className="mb-3 text-2xl font-bold text-slate-900">怎麼運作</h2>
        <ol className="list-decimal space-y-2 pl-6 text-lg text-slate-800">
          {STEPS.map((step) => (
            <li key={step}>{step}</li>
          ))}
        </ol>
      </section>

      <PageCta>
        <PrimaryLink href="/register">建立帳號，開始整理你的第一份報告</PrimaryLink>
      </PageCta>
    </PublicPage>
  );
}
