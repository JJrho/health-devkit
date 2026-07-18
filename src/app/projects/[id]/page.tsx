"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { FormMessage } from "@/components/auth/auth-ui";

interface DashboardStatusItem {
  testDefinitionId: string;
  canonicalName: string;
  unit: string;
  value: string;
  referenceRange: string | null;
  date: string;
}

interface DashboardChangeItem {
  testDefinitionId: string;
  canonicalName: string;
  direction: "up" | "down" | "flat";
}

const DIRECTION_LABEL: Record<DashboardChangeItem["direction"], string> = {
  up: "↑ 上升",
  down: "↓ 下降",
  flat: "→ 持平",
};

type LoadState = "loading" | "ready" | "unauthorized" | "denied" | "error";

/** 健康戰情（E3-F1，SDD §4.7／§5，上游 §26）：專案預設首頁，六區塊版面 */
export default function DashboardPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [currentStatus, setCurrentStatus] = useState<DashboardStatusItem[]>([]);
  const [earlyChanges, setEarlyChanges] = useState<DashboardChangeItem[]>([]);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/dashboard`)
      .then((response) => {
        if (response.status === 401) return setLoadState("unauthorized");
        if (response.status === 403) return setLoadState("denied");
        if (!response.ok) return setLoadState("error");
        return response.json().then((data) => {
          setCurrentStatus(data.currentStatus);
          setEarlyChanges(data.earlyChanges);
          setLoadState("ready");
        });
      })
      .catch(() => setLoadState("error"));
  }, [projectId]);

  return (
    <main className="mx-auto min-h-screen max-w-4xl bg-slate-50 p-6">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">我的健康戰情</h1>

      {loadState === "loading" && <p className="text-lg text-slate-700">載入中…</p>}
      {loadState === "unauthorized" && <FormMessage kind="error" text="請先登入。" />}
      {loadState === "denied" && <FormMessage kind="error" text="你沒有權限查看這個健康專案。" />}
      {loadState === "error" && (
        <FormMessage kind="error" text="連線發生問題，請確認網路後重新整理頁面。" />
      )}

      {loadState === "ready" && (
        <>
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">目前健康狀態</h2>
              {currentStatus.length === 0 ? (
                <p className="text-base text-slate-600">尚無已確認資料。</p>
              ) : (
                <ul className="flex flex-col gap-3">
                  {currentStatus.map((item) => (
                    <li key={item.testDefinitionId} className="border-b border-slate-200 pb-2">
                      <p className="text-lg font-semibold text-slate-900">{item.canonicalName}</p>
                      <p className="text-base text-slate-700">
                        {item.value} {item.unit}
                        {item.referenceRange && (
                          <span className="text-slate-500">（參考區間：{item.referenceRange}）</span>
                        )}
                      </p>
                      <p className="text-sm text-slate-500">{item.date}</p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <PlaceholderCard title="目前行動計畫" note="尚未建立行動計畫" />

            <section className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
              <h2 className="mb-4 text-xl font-semibold text-slate-900">早期變化</h2>
              {earlyChanges.length === 0 ? (
                <p className="text-base text-slate-600">資料筆數尚不足以判斷變化方向。</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {earlyChanges.map((item) => (
                    <li key={item.testDefinitionId} className="text-base text-slate-700">
                      {item.canonicalName}：{DIRECTION_LABEL[item.direction]}
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <PlaceholderCard title="情境與應對" note="此功能尚未推出" />
            <PlaceholderCard title="證據與不確定性" note="此功能尚未推出" />
            <PlaceholderCard title="專業協助" note="此功能尚未推出" />
          </div>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href={`/projects/${projectId}/trends`}
              className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              趨勢分析
            </Link>
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

function PlaceholderCard({ title, note }: { title: string; note: string }) {
  return (
    <section className="rounded-2xl border border-dashed border-slate-300 bg-slate-100 p-6">
      <h2 className="mb-2 text-xl font-semibold text-slate-700">{title}</h2>
      <p className="text-base text-slate-500">{note}</p>
    </section>
  );
}
