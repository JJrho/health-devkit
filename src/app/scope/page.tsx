import type { Metadata } from "next";
import { PageCta, PrimaryLink, PublicPage } from "@/components/public/public-shell";

/**
 * 公開站「能做什麼・不能做什麼」頁（E7-F1）。文字逐字採用
 * 14_PUBLIC_SITE_COPY.md 頁 2/5，不重寫不潤飾。單頁兩區塊（A149，見
 * sprints/sprint-25-dor.md），非拆兩個路由。
 */
export const metadata: Metadata = {
  title: "能做什麼・不能做什麼｜個人健康檢查管理平台",
  description: "先說清楚，這個平台能幫你什麼、不能幫你什麼。",
};

export default function ScopePage() {
  return (
    <PublicPage>
      <h1 className="text-4xl font-bold text-slate-900">先說清楚，這個平台能幫你什麼、不能幫你什麼</h1>

      <div className="mt-8 flex flex-col gap-8">
        <section>
          <h2 className="mb-3 text-2xl font-bold text-slate-900">能做什麼</h2>
          <ul className="list-disc space-y-2 pl-6 text-lg text-slate-800">
            <li>把歷年健檢報告整理成看得懂的長期走勢，不用再一張一張分開看</li>
            <li>自動幫忙讀取報告上的數字，但一定會請你親自核對確認，不會沒經過你同意就直接採用</li>
            <li>針對你的健康問題，用有出處根據的資料回答，並附上來源讓你自己查證</li>
            <li>陪你訂一個可以持續、也可以隨時喊停的健康行動計畫</li>
            <li>讓你記錄飲食、活動、睡眠、疼痛與各種不舒服</li>
            <li>定期幫你檢討這個計畫有沒有效、需不需要調整</li>
            <li>有需要看診時，幫你整理一份看診摘要帶去給醫師</li>
          </ul>
        </section>

        <section>
          <h2 className="mb-3 text-2xl font-bold text-slate-900">不能做什麼</h2>
          <ul className="list-disc space-y-2 pl-6 text-lg text-slate-800">
            <li>不會告訴你「得了什麼病」——這是醫師的專業判斷，不是這個平台的角色</li>
            <li>不會幫你決定吃什麼藥、吃多少劑量，也不會建議你停藥</li>
            <li>不是緊急醫療服務——如果出現立即危險的症狀，請直接就醫或撥打 119</li>
            <li>不會用命理、紫微斗數或流年流月推算你的健康風險</li>
            <li>不會只憑一次 BMI 或單一數字，就幫你決定該做什麼運動</li>
            <li>不會用「再不處理就會很嚴重」這類話術，推銷你付費服務</li>
          </ul>
        </section>
      </div>

      <PageCta>
        <span className="w-full text-slate-700">如果這正是你需要的，</span>
        <PrimaryLink href="/register">建立帳號試試看</PrimaryLink>
      </PageCta>
    </PublicPage>
  );
}
