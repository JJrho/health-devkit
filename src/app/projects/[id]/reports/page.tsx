"use client";

import { use, useState } from "react";
import Link from "next/link";
import { CheckboxField, FormMessage, SubmitButton, TextareaField } from "@/components/auth/auth-ui";

interface TrendPoint {
  date: string;
  value: string;
  referenceRange: string | null;
}

interface TrendSeries {
  canonicalName: string;
  unit: string;
  points: TrendPoint[];
}

interface PlanInfo {
  id: string;
  title: string;
  status: string;
  baseline: string | null;
  needsProfessionalEvaluation: boolean;
  latestEscalationNote: string | null;
}

interface SymptomInfo {
  id: string;
  description: string;
  occurredAt: string;
  isAdverseEvent: boolean;
  status: string;
}

interface VisitSummaryData {
  projectName: string;
  generatedAt: string;
  background?: Record<string, unknown>;
  trends?: TrendSeries[];
  plans?: PlanInfo[];
  symptoms?: SymptomInfo[];
  question?: string;
}

const STATUS_LABEL: Record<string, string> = {
  active: "執行中",
  paused: "已暫停",
  ineffective: "可能無效",
  escalated: "需要專業評估",
};

/** E5-F4（SDD §4.11；C19/C20）：看診摘要（即時彙整，不落地儲存，見 A128）與資料匯出 */
export default function ReportsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const [sections, setSections] = useState({
    background: true,
    trends: true,
    plans: true,
    symptoms: true,
    questions: true,
  });
  const [trendFrom, setTrendFrom] = useState("");
  const [trendTo, setTrendTo] = useState("");
  const [symptomFrom, setSymptomFrom] = useState("");
  const [symptomTo, setSymptomTo] = useState("");
  const [question, setQuestion] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({
    kind: null,
    text: "",
  });
  const [summary, setSummary] = useState<VisitSummaryData | null>(null);

  async function handleGenerate(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    if (!Object.values(sections).some(Boolean)) {
      setMessage({ kind: "error", text: "請至少勾選一個區塊。" });
      return;
    }
    setPending(true);
    setMessage({ kind: null, text: "" });
    try {
      const response = await fetch(`/api/projects/${projectId}/visit-summary`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          sections,
          trendFrom: trendFrom || undefined,
          trendTo: trendTo || undefined,
          symptomFrom: symptomFrom || undefined,
          symptomTo: symptomTo || undefined,
          question: question || undefined,
        }),
      });
      const data = await response.json();
      if (response.status === 401) {
        setMessage({ kind: "error", text: "請先登入。" });
      } else if (response.status === 403) {
        setMessage({ kind: "error", text: "你沒有權限查看這個健康專案。" });
      } else if (!response.ok) {
        setMessage({ kind: "error", text: data.error?.message ?? "產生看診摘要失敗，請再試一次。" });
      } else {
        setSummary(data.summary);
        setMessage({ kind: "success", text: "看診摘要已產生，可於下方預覽並列印／另存為 PDF。" });
      }
    } catch {
      setMessage({ kind: "error", text: "連線發生問題，請確認網路後再試一次。" });
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6 print:bg-white print:p-0">
      <style>{`
        @media print {
          body * { visibility: hidden; }
          #visit-summary-print, #visit-summary-print * { visibility: visible; }
          #visit-summary-print { position: absolute; left: 0; top: 0; width: 100%; }
          @page { size: A4; margin: 15mm; }
        }
      `}</style>

      <div className="print:hidden">
        <h1 className="mb-6 text-3xl font-bold text-slate-900">看診摘要與資料匯出</h1>

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">產生看診摘要</h2>
          <FormMessage kind={message.kind} text={message.text} />
          <form onSubmit={handleGenerate} noValidate>
            <p className="mb-2 text-lg font-medium text-slate-900">要包含哪些區塊？</p>
            <CheckboxField
              id="section-background"
              checked={sections.background}
              onChange={(checked) => setSections((s) => ({ ...s, background: checked }))}
              label="背景（個人健康背景）"
            />
            <CheckboxField
              id="section-trends"
              checked={sections.trends}
              onChange={(checked) => setSections((s) => ({ ...s, trends: checked }))}
              label="期間趨勢"
            />
            {sections.trends && (
              <div className="mb-4 ml-9 flex gap-3">
                <input
                  type="date"
                  aria-label="趨勢起始日期"
                  value={trendFrom}
                  onChange={(e) => setTrendFrom(e.target.value)}
                  className="rounded-lg border-2 border-slate-400 px-3 py-2 text-base"
                />
                <span className="self-center text-slate-600">至</span>
                <input
                  type="date"
                  aria-label="趨勢結束日期"
                  value={trendTo}
                  onChange={(e) => setTrendTo(e.target.value)}
                  className="rounded-lg border-2 border-slate-400 px-3 py-2 text-base"
                />
              </div>
            )}
            <CheckboxField
              id="section-plans"
              checked={sections.plans}
              onChange={(checked) => setSections((s) => ({ ...s, plans: checked }))}
              label="執行中計畫"
            />
            <CheckboxField
              id="section-symptoms"
              checked={sections.symptoms}
              onChange={(checked) => setSections((s) => ({ ...s, symptoms: checked }))}
              label="症狀事件"
            />
            {sections.symptoms && (
              <div className="mb-4 ml-9 flex gap-3">
                <input
                  type="date"
                  aria-label="症狀事件起始日期"
                  value={symptomFrom}
                  onChange={(e) => setSymptomFrom(e.target.value)}
                  className="rounded-lg border-2 border-slate-400 px-3 py-2 text-base"
                />
                <span className="self-center text-slate-600">至</span>
                <input
                  type="date"
                  aria-label="症狀事件結束日期"
                  value={symptomTo}
                  onChange={(e) => setSymptomTo(e.target.value)}
                  className="rounded-lg border-2 border-slate-400 px-3 py-2 text-base"
                />
              </div>
            )}
            <CheckboxField
              id="section-questions"
              checked={sections.questions}
              onChange={(checked) => setSections((s) => ({ ...s, questions: checked }))}
              label="想問醫師的問題"
            />
            {sections.questions && (
              <TextareaField
                id="question"
                label="想問醫師的問題（可留空）"
                value={question}
                onChange={setQuestion}
              />
            )}
            <SubmitButton pending={pending}>產生看診摘要</SubmitButton>
          </form>
        </section>

        {summary && (
          <button
            type="button"
            onClick={() => window.print()}
            className="mb-8 rounded-lg bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            列印／另存為 PDF
          </button>
        )}

        <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
          <h2 className="mb-4 text-xl font-semibold text-slate-900">匯出資料</h2>
          <p className="mb-4 text-base text-slate-700">
            下載這個專案的完整資料（結構化資料＋趨勢 CSV＋所有原始上傳檔案）。
          </p>
          <a
            href={`/api/projects/${projectId}/export`}
            download
            className="inline-block rounded-lg bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300"
          >
            匯出資料（ZIP）
          </a>
        </section>

        <Link
          href={`/projects/${projectId}`}
          className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          回健康戰情
        </Link>
      </div>

      {summary && (
        <div id="visit-summary-print" className="mt-8 border-t-4 border-slate-300 pt-8 print:mt-0 print:border-0 print:pt-0">
          <h1 className="mb-2 text-2xl font-bold text-slate-900">看診摘要</h1>
          <p className="mb-6 text-sm text-slate-600">
            {summary.projectName}｜產生時間：{new Date(summary.generatedAt).toLocaleString("zh-TW")}
          </p>

          {summary.background !== undefined && (
            <section className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">背景</h2>
              {Object.keys(summary.background).length === 0 ? (
                <p className="text-base text-slate-600">無</p>
              ) : (
                <ul className="text-base text-slate-800">
                  {Object.entries(summary.background).map(([key, value]) => (
                    <li key={key}>
                      {key}：{String(value)}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {summary.trends !== undefined && (
            <section className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">期間趨勢</h2>
              {summary.trends.length === 0 ? (
                <p className="text-base text-slate-600">無</p>
              ) : (
                summary.trends.map((series) => (
                  <div key={series.canonicalName + series.unit} className="mb-3">
                    <p className="font-medium text-slate-900">
                      {series.canonicalName}（{series.unit}）
                    </p>
                    <ul className="text-base text-slate-800">
                      {series.points.map((point, i) => (
                        <li key={i}>
                          {point.date}：{point.value}
                          {point.referenceRange && `（參考區間：${point.referenceRange}）`}
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </section>
          )}

          {summary.plans !== undefined && (
            <section className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">執行中計畫</h2>
              {summary.plans.length === 0 ? (
                <p className="text-base text-slate-600">無</p>
              ) : (
                summary.plans.map((plan) => (
                  <div key={plan.id} className="mb-3">
                    <p className="font-medium text-slate-900">
                      {plan.title}（{STATUS_LABEL[plan.status] ?? plan.status}）
                    </p>
                    {plan.baseline && <p className="text-base text-slate-800">基準：{plan.baseline}</p>}
                    {plan.needsProfessionalEvaluation && (
                      <p className="text-base font-medium text-red-700">
                        此計畫近期檢討判斷需要專業評估。
                        {plan.latestEscalationNote && `（${plan.latestEscalationNote}）`}
                      </p>
                    )}
                  </div>
                ))
              )}
            </section>
          )}

          {summary.symptoms !== undefined && (
            <section className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">症狀事件</h2>
              {summary.symptoms.length === 0 ? (
                <p className="text-base text-slate-600">無</p>
              ) : (
                <ul className="text-base text-slate-800">
                  {summary.symptoms.map((symptom) => (
                    <li key={symptom.id}>
                      {symptom.occurredAt}　{symptom.description}
                      {symptom.isAdverseEvent && "（不良反應）"}
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )}

          {summary.question !== undefined && (
            <section className="mb-6">
              <h2 className="mb-2 text-lg font-semibold text-slate-900">想問醫師的問題</h2>
              <p className="whitespace-pre-wrap text-base text-slate-800">
                {summary.question || "無"}
              </p>
            </section>
          )}
        </div>
      )}
    </main>
  );
}
