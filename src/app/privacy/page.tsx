import type { Metadata } from "next";
import { PageCta, PrimaryLink, PublicPage, SecondaryLink } from "@/components/public/public-shell";

/**
 * 公開站「隱私與資料安全」頁（E7-F1）。文字逐字採用
 * 14_PUBLIC_SITE_COPY.md 頁 1/5，不重寫不潤飾。
 * 「檔案怎麼存放」段落補充一句原始檔保留與刪除揭露（2026-08-08 文案勘誤，
 * 對應 E2-F5 刪除引導提示功能，逐字比對用 PO 指定文字，不重寫），
 * 見 07_SPRINT_LOG.md 與 09_KNOWLEDGE_BASE.md KB-045。
 */
export const metadata: Metadata = {
  title: "隱私與資料安全｜個人健康檢查管理平台",
  description: "你的健康資料，只屬於你——說明資料存取、檔案存放、掃描、修改紀錄與帳號刪除規則。",
};

export default function PrivacyPage() {
  return (
    <PublicPage>
      <h1 className="text-4xl font-bold text-slate-900">你的健康資料，只屬於你</h1>

      <div className="mt-8 flex flex-col gap-8 text-lg text-slate-800">
        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">誰看得到你的資料</h2>
          <p>
            只有你自己。系統每一次查詢都會先確認三件事：這是不是你本人、這筆資料是不是在你的健康專案裡、這筆資料有沒有被刪除——三關都過才看得到，不會因為猜到網址或編號就能看到別人的資料。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">檔案怎麼存放</h2>
          <p>
            你上傳的健檢報告，預設不公開存放。要下載時，系統會產生一個限時的專屬連結，過期即失效，不會有一個誰都能打開的固定網址。
          </p>
          <p className="mt-4">
            你確認完數值後，原始檔案（PDF 或照片本身）仍會保留在系統裡，方便之後核對或匯出；如果報告上印有你的姓名等資訊，這份原始檔案不會另外去識別化。如果你不需要保留，可以隨時到「健檔報告」頁面自行刪除，系統不會自動幫你刪。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">上傳前會先做什麼檢查</h2>
          <p>每一份檔案上傳後，都會先做病毒與惡意程式掃描，沒通過不會被存入系統。</p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">資料會不會被拿去訓練 AI</h2>
          <p>不會。除非你另外明確同意，你的健康資料不會被用來訓練任何模型。</p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">修改紀錄怎麼處理</h2>
          <p>
            你確認過的每一筆數值都會完整保留；之後需要修正時，系統會建立新版本，不會覆蓋原始紀錄，方便你回頭查對照。
          </p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">想刪除帳號時</h2>
          <p>可以隨時申請刪除，有 30 天緩衝期可以反悔撤銷；緩衝期過後，系統會真正清除資料，不是只標記隱藏。</p>
        </section>

        <section>
          <h2 className="mb-2 text-2xl font-bold text-slate-900">我們不會做的事</h2>
          <p>不會把你的健康資料放進任何行銷或第三方名單；系統的紀錄檔裡不會留下你的健康內容、對話或個人識別碼。</p>
        </section>
      </div>

      <PageCta>
        <span className="w-full text-slate-700">了解資料保護方式後，</span>
        <PrimaryLink href="/register">建立帳號</PrimaryLink>
        <SecondaryLink href="/">回首頁</SecondaryLink>
      </PageCta>
    </PublicPage>
  );
}
