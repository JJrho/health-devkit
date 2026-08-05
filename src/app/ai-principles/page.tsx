import type { Metadata } from "next";
import { PageCta, PrimaryLink, PublicPage, SecondaryLink } from "@/components/public/public-shell";

/**
 * 公開站「來源與 AI 原則」頁（E7-F1）。文字逐字採用
 * 14_PUBLIC_SITE_COPY.md 頁 5/5，不重寫不潤飾。
 */
export const metadata: Metadata = {
  title: "來源與 AI 原則｜個人健康檢查管理平台",
  description: "AI 怎麼用你的資料，怎麼給答案。",
};

export default function AiPrinciplesPage() {
  return (
    <PublicPage>
      <h1 className="text-4xl font-bold text-slate-900">AI 怎麼用你的資料，怎麼給答案</h1>

      <div className="mt-8 flex flex-col gap-8 text-lg text-slate-800">
        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">每一句健康相關的說明，都有出處</h2>
          <p>AI 回答問題時會附上引用的資料來源，你可以自己點開查證，不會有憑空生成的建議。</p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">只根據你確認過的資料</h2>
          <p>AI 分析時只會用你自己核對確認過的健康紀錄，還沒確認的辨識結果不會被拿進去分析。</p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">不會自己生成連結</h2>
          <p>AI 不會捏造參考網址或來源，所有引用都來自系統內建、已審核的資料庫。</p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">沒有進步時，不會自動加重</h2>
          <p>如果行動計畫一段時間沒看到改善，系統不會自動要求你做更多、限制更多，也不會把原因歸咎於你。</p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">停止就是停止</h2>
          <p>如果因為身體不舒服而暫停一個計畫，系統不會自動幫你重新啟動，需要你自己決定要不要繼續。</p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">命理與紫微斗數不會混進健康建議</h2>
          <p>這兩件事在我們這裡是完全分開的系統，不會互相影響、互相參考。</p>
        </section>
      </div>

      <PageCta>
        <span className="w-full text-slate-700">了解 AI 怎麼運作後，</span>
        <PrimaryLink href="/register">建立帳號</PrimaryLink>
        <SecondaryLink href="/">回首頁</SecondaryLink>
      </PageCta>
    </PublicPage>
  );
}
