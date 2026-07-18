"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import * as echarts from "echarts";
import { FormMessage } from "@/components/auth/auth-ui";

interface TrendPoint {
  observationId: string;
  date: string;
  dateEstimated: boolean;
  value: string;
  referenceRange: string | null;
  documentId: string;
  pageNumber: number;
}

interface TrendSeries {
  testDefinitionId: string;
  canonicalName: string;
  unit: string;
  unitMismatch: boolean;
  points: TrendPoint[];
}

type LoadState = "loading" | "ready" | "unauthorized" | "denied" | "error";

/** 趨勢分析（E3-F2，SDD §4.7）：只顯示已標準化的正式紀錄，每點可回查原頁 */
export default function TrendsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [series, setSeries] = useState<TrendSeries[]>([]);
  const [message, setMessage] = useState("");

  useEffect(() => {
    fetch(`/api/projects/${projectId}/trends`)
      .then((response) => {
        if (response.status === 401) return setLoadState("unauthorized");
        if (response.status === 403) return setLoadState("denied");
        if (!response.ok) return setLoadState("error");
        return response.json().then((data) => {
          setSeries(data.series);
          setLoadState("ready");
        });
      })
      .catch(() => setLoadState("error"));
  }, [projectId]);

  async function openSourcePage(documentId: string, pageNumber: number) {
    const response = await fetch(`/api/projects/${projectId}/documents/${documentId}/preview`);
    const body = await response.json();
    if (response.ok) {
      window.open(`${body.url}#page=${pageNumber}`, "_blank", "noopener,noreferrer");
    } else {
      setMessage("無法取得預覽連結，請再試一次。");
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">趨勢分析</h1>

      {loadState === "loading" && <p className="text-lg text-slate-700">載入中…</p>}
      {loadState === "unauthorized" && <FormMessage kind="error" text="請先登入。" />}
      {loadState === "denied" && <FormMessage kind="error" text="你沒有權限查看這個健康專案。" />}
      {loadState === "error" && (
        <FormMessage kind="error" text="連線發生問題，請確認網路後重新整理頁面。" />
      )}

      {loadState === "ready" && (
        <>
          {message && <FormMessage kind="error" text={message} />}

          {series.length === 0 ? (
            <p className="text-lg text-slate-700">
              尚無已確認資料。上傳並確認健檢報告後，正式標準化的數值會顯示在這裡。
            </p>
          ) : (
            <div className="flex flex-col gap-8">
              {series.map((item) => (
                <TrendCard
                  key={`${item.testDefinitionId}::${item.unit}`}
                  series={item}
                  onDrillDown={openSourcePage}
                />
              ))}
            </div>
          )}

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href={`/projects/${projectId}/documents`}
              className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              健檔文件
            </Link>
            <Link
              href="/projects"
              className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              回專案列表
            </Link>
          </div>
        </>
      )}
    </main>
  );
}

function TrendCard({
  series,
  onDrillDown,
}: {
  series: TrendSeries;
  onDrillDown: (documentId: string, pageNumber: number) => void;
}) {
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!chartRef.current) return;
    const chart = echarts.init(chartRef.current);
    chart.setOption({
      grid: { left: 56, right: 24, top: 24, bottom: 40 },
      xAxis: { type: "category", data: series.points.map((point) => point.date) },
      yAxis: { type: "value", name: series.unit, scale: true },
      tooltip: { trigger: "axis" },
      series: [
        {
          type: "line",
          data: series.points.map((point) => Number(point.value)),
          symbolSize: 8,
          color: "#2563EB",
        },
      ],
    });
    const handleResize = () => chart.resize();
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.dispose();
    };
  }, [series]);

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <h2 className="mb-1 text-xl font-semibold text-slate-900">
        {series.canonicalName}（{series.unit}）
      </h2>
      {series.unitMismatch && (
        <p className="mb-3 text-base text-amber-800">
          ⚠ 偵測到同一項目出現不同單位，已拆開顯示避免錯誤連線。
        </p>
      )}
      <div ref={chartRef} role="img" aria-label={`${series.canonicalName} 趨勢圖`} className="h-64 w-full" />

      <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse text-left text-base">
          <caption className="sr-only">{series.canonicalName} 等價資料表</caption>
          <thead>
            <tr className="border-b-2 border-slate-300">
              <th className="py-2 pr-4">日期</th>
              <th className="py-2 pr-4">數值</th>
              <th className="py-2 pr-4">參考區間</th>
              <th className="py-2 pr-4">來源</th>
            </tr>
          </thead>
          <tbody>
            {series.points.map((point) => (
              <tr key={point.observationId} className="border-b border-slate-200">
                <td className="py-2 pr-4">
                  {point.date}
                  {point.dateEstimated && <span className="text-slate-500">（估計，未設定檢驗日期）</span>}
                </td>
                <td className="py-2 pr-4">{point.value}</td>
                <td className="py-2 pr-4 text-slate-500">{point.referenceRange ?? "—"}</td>
                <td className="py-2 pr-4">
                  <button
                    type="button"
                    onClick={() => onDrillDown(point.documentId, point.pageNumber)}
                    className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                  >
                    第 {point.pageNumber} 頁
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}
