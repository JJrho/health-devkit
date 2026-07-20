"use client";

import { use, useEffect, useState } from "react";
import Link from "next/link";
import { FormMessage } from "@/components/auth/auth-ui";

interface PlanView {
  id: string;
  title: string;
  baseline: string | null;
  riskNote: string | null;
  stopCondition: string | null;
  referralCondition: string | null;
  reviewDate: string | null;
  status: string;
  stopReason: string | null;
  version: number;
}

interface ActionView {
  id: string;
  description: string;
  category: string | null;
}

interface MetricView {
  id: string;
  category: string;
  name: string;
  description: string | null;
}

interface CheckInView {
  id: string;
  metricId: string;
  value: string;
  note: string | null;
  checkinDate: string;
  status: string;
}

interface SymptomEventView {
  id: string;
  description: string;
  occurredAt: string;
  isAdverseEvent: boolean;
  status: string;
}

interface PlanDetail {
  plan: PlanView;
  actions: ActionView[];
  metrics: MetricView[];
  checkIns: CheckInView[];
  symptomEvents: SymptomEventView[];
}

type LoadState = "loading" | "ready" | "unauthorized" | "denied" | "error";

const STATUS_LABEL: Record<string, string> = {
  draft: "草稿",
  needs_info: "資訊未齊全",
  safety_review: "安全審查中",
  active: "執行中",
  paused: "已暫停",
  stopped: "已停止",
  review_due: "待檢討",
  archived: "已封存",
};

const METRIC_CATEGORY_LABEL: Record<string, string> = {
  leading: "領先指標",
  outcome: "結果指標",
  safety: "安全指標",
};

const SYMPTOM_STATUS_LABEL: Record<string, string> = {
  open: "剛回報",
  monitoring: "觀察中",
  resolved: "已解決",
  escalated: "需要專業評估",
};

/** E5-F1 Part 2/2（SDD §4.10）：行動計畫頁，已啟用計畫的編輯會建立新版本（A96） */
export default function PlansPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [plans, setPlans] = useState<PlanView[]>([]);
  const [errorText, setErrorText] = useState("");
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [expandedPlanId, setExpandedPlanId] = useState<string | null>(null);
  const [detail, setDetail] = useState<PlanDetail | null>(null);

  useEffect(() => {
    loadPlans();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  async function loadPlans() {
    const response = await fetch(`/api/projects/${projectId}/plans`);
    if (response.status === 401) return setLoadState("unauthorized");
    if (response.status === 403) return setLoadState("denied");
    if (!response.ok) return setLoadState("error");
    const data = (await response.json()) as { plans: PlanView[] };
    setPlans(data.plans);
    setLoadState("ready");
  }

  async function loadDetail(planId: string) {
    const response = await fetch(`/api/projects/${projectId}/plans/${planId}`);
    if (!response.ok) return;
    const data = (await response.json()) as PlanDetail;
    setDetail(data);
  }

  async function toggleExpand(planId: string) {
    if (expandedPlanId === planId) {
      setExpandedPlanId(null);
      setDetail(null);
      return;
    }
    setExpandedPlanId(planId);
    setDetail(null);
    await loadDetail(planId);
  }

  async function refreshAfterChange(planId?: string) {
    await loadPlans();
    if (planId) await loadDetail(planId);
  }

  async function handleCreate(input: {
    title: string;
    baseline: string;
    riskNote: string;
    stopCondition: string;
    referralCondition: string;
    reviewDate: string;
  }) {
    setErrorText("");
    const response = await fetch(`/api/projects/${projectId}/plans`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) return setErrorText("建立計畫失敗，請再試一次。");
    setShowCreateForm(false);
    await loadPlans();
  }

  async function handleActivate(planId: string) {
    setErrorText("");
    const response = await fetch(`/api/projects/${projectId}/plans/${planId}/activate`, { method: "POST" });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setErrorText(data?.error?.message ?? "啟用失敗，請再試一次。");
      await refreshAfterChange(planId);
      return;
    }
    await refreshAfterChange(planId);
  }

  async function handleTransition(planId: string, action: "pause" | "resume" | "stop", body?: object) {
    setErrorText("");
    const response = await fetch(`/api/projects/${projectId}/plans/${planId}/${action}`, {
      method: "POST",
      headers: body ? { "Content-Type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setErrorText(data?.error?.message ?? "操作失敗，請再試一次。");
      return;
    }
    if (action === "stop") {
      setExpandedPlanId(null);
      setDetail(null);
      await loadPlans();
    } else {
      await refreshAfterChange(planId);
    }
  }

  async function handleDelete(planId: string) {
    setErrorText("");
    const response = await fetch(`/api/projects/${projectId}/plans/${planId}`, { method: "DELETE" });
    if (!response.ok) return setErrorText("刪除失敗，請再試一次。");
    setExpandedPlanId(null);
    setDetail(null);
    await loadPlans();
  }

  async function handleUpdateCore(
    planId: string,
    input: {
      title: string;
      baseline: string;
      riskNote: string;
      stopCondition: string;
      referralCondition: string;
      reviewDate: string;
    },
  ) {
    setErrorText("");
    const response = await fetch(`/api/projects/${projectId}/plans/${planId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setErrorText(data?.error?.message ?? "更新失敗，請再試一次。");
      return;
    }
    const data = (await response.json()) as { plan: PlanView };
    setExpandedPlanId(data.plan.id);
    setDetail(null);
    await loadPlans();
    await loadDetail(data.plan.id);
  }

  async function handleAddAction(planId: string, description: string, category: string) {
    if (!description.trim()) return;
    await fetch(`/api/projects/${projectId}/plans/${planId}/actions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, category: category || undefined }),
    });
    await loadDetail(planId);
  }

  async function handleRemoveAction(planId: string, actionId: string) {
    await fetch(`/api/projects/${projectId}/plans/${planId}/actions/${actionId}`, { method: "DELETE" });
    await loadDetail(planId);
  }

  async function handleAddMetric(planId: string, category: string, name: string) {
    if (!name.trim()) return;
    await fetch(`/api/projects/${projectId}/plans/${planId}/metrics`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ category, name }),
    });
    await loadDetail(planId);
  }

  async function handleRemoveMetric(planId: string, metricId: string) {
    await fetch(`/api/projects/${projectId}/plans/${planId}/metrics/${metricId}`, { method: "DELETE" });
    await loadDetail(planId);
  }

  async function handleAddCheckIn(
    planId: string,
    metricId: string,
    value: string,
    checkinDate: string,
    note: string,
  ) {
    if (!metricId || !value.trim() || !checkinDate) return;
    setErrorText("");
    const response = await fetch(`/api/projects/${projectId}/plans/${planId}/check-ins`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ metricId, value, checkinDate, note: note || undefined }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setErrorText(data?.error?.message ?? "記錄日常回報失敗，請再試一次。");
      return;
    }
    await loadDetail(planId);
  }

  async function handleRemoveCheckIn(planId: string, checkInId: string) {
    await fetch(`/api/projects/${projectId}/plans/${planId}/check-ins/${checkInId}`, { method: "DELETE" });
    await loadDetail(planId);
  }

  async function handleAddSymptomEvent(
    planId: string,
    description: string,
    occurredAt: string,
    isAdverseEvent: boolean,
  ) {
    if (!description.trim() || !occurredAt) return;
    setErrorText("");
    const response = await fetch(`/api/projects/${projectId}/plans/${planId}/symptoms`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description, occurredAt, isAdverseEvent }),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setErrorText(data?.error?.message ?? "回報症狀事件失敗，請再試一次。");
      return;
    }
    await refreshAfterChange(planId);
  }

  async function handleUpdateSymptomEvent(
    planId: string,
    symptomEventId: string,
    input: { status?: string; isAdverseEvent?: boolean },
  ) {
    setErrorText("");
    const response = await fetch(`/api/projects/${projectId}/plans/${planId}/symptoms/${symptomEventId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok) {
      const data = (await response.json().catch(() => null)) as { error?: { message?: string } } | null;
      setErrorText(data?.error?.message ?? "更新症狀事件失敗，請再試一次。");
      return;
    }
    await refreshAfterChange(planId);
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">行動計畫</h1>

      {loadState === "loading" && <p className="text-lg text-slate-700">載入中…</p>}
      {loadState === "unauthorized" && <FormMessage kind="error" text="請先登入。" />}
      {loadState === "denied" && <FormMessage kind="error" text="你沒有權限查看這個健康專案。" />}
      {loadState === "error" && <FormMessage kind="error" text="連線發生問題，請確認網路後重新整理頁面。" />}

      {loadState === "ready" && (
        <>
          {errorText && <FormMessage kind="error" text={errorText} />}

          <div className="mb-4">
            <button
              type="button"
              onClick={() => setShowCreateForm((prev) => !prev)}
              className="rounded-lg bg-blue-700 px-4 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              {showCreateForm ? "取消建立" : "建立新計畫"}
            </button>
          </div>

          {showCreateForm && (
            <PlanCoreForm submitLabel="建立計畫" onSubmit={handleCreate} />
          )}

          {plans.length === 0 && !showCreateForm && (
            <p className="text-lg text-slate-700">尚未建立任何行動計畫。</p>
          )}

          <div className="flex flex-col gap-4">
            {plans.map((plan) => (
              <section
                key={plan.id}
                className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <h2 className="text-xl font-semibold text-slate-900">{plan.title}</h2>
                    <span className="inline-block rounded-full border border-slate-300 px-3 py-1 text-sm font-medium text-slate-700">
                      {STATUS_LABEL[plan.status] ?? plan.status}
                    </span>
                  </div>
                  <button
                    type="button"
                    onClick={() => toggleExpand(plan.id)}
                    className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                  >
                    {expandedPlanId === plan.id ? "收合" : "查看詳情"}
                  </button>
                </div>

                {expandedPlanId === plan.id && (
                  <PlanDetailPanel
                    detail={detail}
                    onActivate={() => handleActivate(plan.id)}
                    onPause={() => handleTransition(plan.id, "pause")}
                    onResume={() => handleTransition(plan.id, "resume")}
                    onStop={() => handleTransition(plan.id, "stop", { reason: "user_choice" })}
                    onDelete={() => handleDelete(plan.id)}
                    onUpdateCore={(input) => handleUpdateCore(plan.id, input)}
                    onAddAction={(description, category) => handleAddAction(plan.id, description, category)}
                    onRemoveAction={(actionId) => handleRemoveAction(plan.id, actionId)}
                    onAddMetric={(category, name) => handleAddMetric(plan.id, category, name)}
                    onRemoveMetric={(metricId) => handleRemoveMetric(plan.id, metricId)}
                    onAddCheckIn={(metricId, value, checkinDate, note) =>
                      handleAddCheckIn(plan.id, metricId, value, checkinDate, note)
                    }
                    onRemoveCheckIn={(checkInId) => handleRemoveCheckIn(plan.id, checkInId)}
                    onAddSymptomEvent={(description, occurredAt, isAdverseEvent) =>
                      handleAddSymptomEvent(plan.id, description, occurredAt, isAdverseEvent)
                    }
                    onUpdateSymptomEvent={(symptomEventId, input) =>
                      handleUpdateSymptomEvent(plan.id, symptomEventId, input)
                    }
                  />
                )}
              </section>
            ))}
          </div>

          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              href={`/projects/${projectId}`}
              className="font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              回健康戰情
            </Link>
          </div>
        </>
      )}
    </main>
  );
}

function PlanDetailPanel({
  detail,
  onActivate,
  onPause,
  onResume,
  onStop,
  onDelete,
  onUpdateCore,
  onAddAction,
  onRemoveAction,
  onAddMetric,
  onRemoveMetric,
  onAddCheckIn,
  onRemoveCheckIn,
  onAddSymptomEvent,
  onUpdateSymptomEvent,
}: {
  detail: PlanDetail | null;
  onActivate: () => void;
  onPause: () => void;
  onResume: () => void;
  onStop: () => void;
  onDelete: () => void;
  onUpdateCore: (input: {
    title: string;
    baseline: string;
    riskNote: string;
    stopCondition: string;
    referralCondition: string;
    reviewDate: string;
  }) => void;
  onAddAction: (description: string, category: string) => void;
  onRemoveAction: (actionId: string) => void;
  onAddMetric: (category: string, name: string) => void;
  onRemoveMetric: (metricId: string) => void;
  onAddCheckIn: (metricId: string, value: string, checkinDate: string, note: string) => void;
  onRemoveCheckIn: (checkInId: string) => void;
  onAddSymptomEvent: (description: string, occurredAt: string, isAdverseEvent: boolean) => void;
  onUpdateSymptomEvent: (symptomEventId: string, input: { status?: string; isAdverseEvent?: boolean }) => void;
}) {
  const [showEditForm, setShowEditForm] = useState(false);
  const [actionDescription, setActionDescription] = useState("");
  const [actionCategory, setActionCategory] = useState("");
  const [metricCategory, setMetricCategory] = useState("leading");
  const [metricName, setMetricName] = useState("");
  const [checkInMetricId, setCheckInMetricId] = useState("");
  const [checkInValue, setCheckInValue] = useState("");
  const [checkInDate, setCheckInDate] = useState("");
  const [checkInNote, setCheckInNote] = useState("");
  const [symptomDescription, setSymptomDescription] = useState("");
  const [symptomOccurredAt, setSymptomOccurredAt] = useState("");
  const [symptomIsAdverseEvent, setSymptomIsAdverseEvent] = useState(false);

  if (!detail) return <p className="mt-4 text-base text-slate-600">載入中…</p>;

  const { plan, actions, metrics, checkIns, symptomEvents } = detail;
  const isEditable = plan.status === "draft" || plan.status === "needs_info";
  const isAdjustable = plan.status === "active" || plan.status === "paused";
  const isExecutable = plan.status === "active" || plan.status === "paused";

  return (
    <div className="mt-4 flex flex-col gap-4 border-t border-slate-200 pt-4">
      <dl className="grid grid-cols-1 gap-2 text-base text-slate-700 sm:grid-cols-2">
        <div>
          <dt className="font-semibold text-slate-900">基準</dt>
          <dd>{plan.baseline || "（未填）"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">風險</dt>
          <dd>{plan.riskNote || "（未填）"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">停止條件</dt>
          <dd>{plan.stopCondition || "（未填）"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">轉介條件</dt>
          <dd>{plan.referralCondition || "（未填）"}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-900">檢討日期</dt>
          <dd>{plan.reviewDate ? plan.reviewDate.slice(0, 10) : "（未填）"}</dd>
        </div>
        {plan.stopReason && (
          <div>
            <dt className="font-semibold text-slate-900">停止原因</dt>
            <dd>{plan.stopReason === "adverse_event" ? "不良反應" : "自行選擇"}</dd>
          </div>
        )}
      </dl>

      <div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">行動</h3>
        {actions.length === 0 ? (
          <p className="text-base text-slate-600">尚未新增任何行動。</p>
        ) : (
          <ul className="mb-2 flex flex-col gap-1">
            {actions.map((a) => (
              <li key={a.id} className="flex items-center justify-between text-base text-slate-700">
                <span>
                  {a.description}
                  {a.category && <span className="text-slate-500">（{a.category}）</span>}
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveAction(a.id)}
                  className="text-sm font-semibold text-slate-600 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  刪除
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`action-desc-${plan.id}`}>
            新增行動描述
          </label>
          <input
            id={`action-desc-${plan.id}`}
            value={actionDescription}
            onChange={(e) => setActionDescription(e.target.value)}
            placeholder="行動描述"
            className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
          />
          <input
            value={actionCategory}
            onChange={(e) => setActionCategory(e.target.value)}
            placeholder="分類（可留空）"
            className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
          />
          <button
            type="button"
            onClick={() => {
              onAddAction(actionDescription, actionCategory);
              setActionDescription("");
              setActionCategory("");
            }}
            className="rounded-lg bg-slate-700 px-3 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            新增行動
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">指標</h3>
        {metrics.length === 0 ? (
          <p className="text-base text-slate-600">尚未新增任何指標。</p>
        ) : (
          <ul className="mb-2 flex flex-col gap-1">
            {metrics.map((m) => (
              <li key={m.id} className="flex items-center justify-between text-base text-slate-700">
                <span>
                  {m.name}（{METRIC_CATEGORY_LABEL[m.category] ?? m.category}）
                </span>
                <button
                  type="button"
                  onClick={() => onRemoveMetric(m.id)}
                  className="text-sm font-semibold text-slate-600 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                >
                  刪除
                </button>
              </li>
            ))}
          </ul>
        )}
        <div className="flex flex-wrap gap-2">
          <label className="sr-only" htmlFor={`metric-category-${plan.id}`}>
            指標分類
          </label>
          <select
            id={`metric-category-${plan.id}`}
            value={metricCategory}
            onChange={(e) => setMetricCategory(e.target.value)}
            className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            <option value="leading">領先指標</option>
            <option value="outcome">結果指標</option>
            <option value="safety">安全指標</option>
          </select>
          <input
            value={metricName}
            onChange={(e) => setMetricName(e.target.value)}
            placeholder="指標名稱"
            className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
          />
          <button
            type="button"
            onClick={() => {
              onAddMetric(metricCategory, metricName);
              setMetricName("");
            }}
            className="rounded-lg bg-slate-700 px-3 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            新增指標
          </button>
        </div>
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">日常回報</h3>
        {checkIns.length === 0 ? (
          <p className="text-base text-slate-600">尚未記錄任何日常回報。</p>
        ) : (
          <ul className="mb-2 flex flex-col gap-1">
            {checkIns.map((c) => {
              const metric = metrics.find((m) => m.id === c.metricId);
              return (
                <li key={c.id} className="flex items-center justify-between text-base text-slate-700">
                  <span>
                    {c.checkinDate.slice(0, 10)}　{metric?.name ?? "（指標已刪除）"}：{c.value}
                    {c.note && <span className="text-slate-500">（{c.note}）</span>}
                    {c.status === "corrected" && <span className="text-slate-500">（已更正）</span>}
                  </span>
                  <button
                    type="button"
                    onClick={() => onRemoveCheckIn(c.id)}
                    className="text-sm font-semibold text-slate-600 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                  >
                    刪除
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {isExecutable && metrics.length > 0 ? (
          <div className="flex flex-wrap items-end gap-2">
            <div>
              <label className="mb-1 block text-sm text-slate-700" htmlFor={`checkin-metric-${plan.id}`}>
                指標
              </label>
              <select
                id={`checkin-metric-${plan.id}`}
                value={checkInMetricId}
                onChange={(e) => setCheckInMetricId(e.target.value)}
                className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                <option value="">請選擇</option>
                {metrics.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-sm text-slate-700" htmlFor={`checkin-date-${plan.id}`}>
                日期
              </label>
              <input
                id={`checkin-date-${plan.id}`}
                type="date"
                value={checkInDate}
                onChange={(e) => setCheckInDate(e.target.value)}
                className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
            </div>
            <input
              value={checkInValue}
              onChange={(e) => setCheckInValue(e.target.value)}
              placeholder="數值／狀況"
              className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
            />
            <input
              value={checkInNote}
              onChange={(e) => setCheckInNote(e.target.value)}
              placeholder="備註（可留空）"
              className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
            />
            <button
              type="button"
              onClick={() => {
                onAddCheckIn(checkInMetricId, checkInValue, checkInDate, checkInNote);
                setCheckInValue("");
                setCheckInNote("");
              }}
              className="rounded-lg bg-slate-700 px-3 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              新增回報
            </button>
          </div>
        ) : (
          isExecutable && <p className="text-sm text-slate-500">請先新增指標才能記錄日常回報。</p>
        )}
      </div>

      <div>
        <h3 className="mb-2 text-lg font-semibold text-slate-900">症狀事件</h3>
        {symptomEvents.length === 0 ? (
          <p className="text-base text-slate-600">尚未回報任何症狀事件。</p>
        ) : (
          <ul className="mb-2 flex flex-col gap-2">
            {symptomEvents.map((s) => (
              <li key={s.id} className="rounded-lg border border-slate-200 p-3 text-base text-slate-700">
                <p>
                  {s.occurredAt.slice(0, 10)}　{s.description}
                  {s.isAdverseEvent && (
                    <span className="ml-2 rounded-full border-2 border-red-600 px-2 py-0.5 text-sm font-semibold text-red-700">
                      不良反應
                    </span>
                  )}
                </p>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <span className="text-sm text-slate-600">
                    狀態：{SYMPTOM_STATUS_LABEL[s.status] ?? s.status}
                  </span>
                  {s.status !== "resolved" && (
                    <button
                      type="button"
                      onClick={() => onUpdateSymptomEvent(s.id, { status: "monitoring" })}
                      className="text-sm font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                    >
                      標記觀察中
                    </button>
                  )}
                  {s.status !== "resolved" && (
                    <button
                      type="button"
                      onClick={() => onUpdateSymptomEvent(s.id, { status: "resolved" })}
                      className="text-sm font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                    >
                      標記已解決
                    </button>
                  )}
                  {s.status !== "escalated" && (
                    <button
                      type="button"
                      onClick={() => onUpdateSymptomEvent(s.id, { status: "escalated" })}
                      className="text-sm font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                    >
                      標記需要專業評估
                    </button>
                  )}
                  {!s.isAdverseEvent && (
                    <button
                      type="button"
                      onClick={() => onUpdateSymptomEvent(s.id, { isAdverseEvent: true })}
                      className="text-sm font-semibold text-red-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
                    >
                      回溯標記為不良反應（將暫停計畫）
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
        {isExecutable && (
          <div className="flex flex-col gap-2">
            <label className="sr-only" htmlFor={`symptom-desc-${plan.id}`}>
              症狀描述
            </label>
            <textarea
              id={`symptom-desc-${plan.id}`}
              value={symptomDescription}
              onChange={(e) => setSymptomDescription(e.target.value)}
              placeholder="描述你的症狀"
              rows={2}
              className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
            />
            <div className="flex flex-wrap items-center gap-2">
              <label className="text-sm text-slate-700" htmlFor={`symptom-date-${plan.id}`}>
                發生時間
              </label>
              <input
                id={`symptom-date-${plan.id}`}
                type="date"
                value={symptomOccurredAt}
                onChange={(e) => setSymptomOccurredAt(e.target.value)}
                className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
              />
              <label className="flex items-center gap-2 text-base text-slate-700">
                <input
                  type="checkbox"
                  checked={symptomIsAdverseEvent}
                  onChange={(e) => setSymptomIsAdverseEvent(e.target.checked)}
                  className="h-5 w-5"
                />
                這是不良反應，需要暫停計畫
              </label>
              <button
                type="button"
                onClick={() => {
                  onAddSymptomEvent(symptomDescription, symptomOccurredAt, symptomIsAdverseEvent);
                  setSymptomDescription("");
                  setSymptomIsAdverseEvent(false);
                }}
                className="rounded-lg bg-slate-700 px-3 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                回報症狀
              </button>
            </div>
          </div>
        )}
      </div>

      <div className="flex flex-wrap gap-3">
        {(isEditable || isAdjustable) && (
          <button
            type="button"
            onClick={() => setShowEditForm((prev) => !prev)}
            className="rounded-lg bg-slate-200 px-4 py-2 text-base font-semibold text-slate-900 focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            {showEditForm ? "取消" : isAdjustable ? "調整（將建立新版本）" : "編輯"}
          </button>
        )}
        {isEditable && (
          <button
            type="button"
            onClick={onActivate}
            className="rounded-lg bg-blue-700 px-4 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            啟用
          </button>
        )}
        {plan.status === "active" && (
          <button
            type="button"
            onClick={onPause}
            className="rounded-lg bg-amber-600 px-4 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            暫停
          </button>
        )}
        {plan.status === "paused" && (
          <button
            type="button"
            onClick={onResume}
            className="rounded-lg bg-blue-700 px-4 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            恢復
          </button>
        )}
        {(plan.status === "active" || plan.status === "paused" || isEditable) && (
          <button
            type="button"
            onClick={onStop}
            className="rounded-lg bg-red-700 px-4 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            停止
          </button>
        )}
        <button
          type="button"
          onClick={onDelete}
          className="rounded-lg border border-slate-400 px-4 py-2 text-base font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          刪除
        </button>
      </div>

      {showEditForm && (
        <PlanCoreForm
          submitLabel={isAdjustable ? "送出調整（建立新版本）" : "儲存編輯"}
          initial={plan}
          onSubmit={(input) => {
            onUpdateCore(input);
            setShowEditForm(false);
          }}
        />
      )}
    </div>
  );
}

function PlanCoreForm({
  submitLabel,
  initial,
  onSubmit,
}: {
  submitLabel: string;
  initial?: PlanView;
  onSubmit: (input: {
    title: string;
    baseline: string;
    riskNote: string;
    stopCondition: string;
    referralCondition: string;
    reviewDate: string;
  }) => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? "");
  const [baseline, setBaseline] = useState(initial?.baseline ?? "");
  const [riskNote, setRiskNote] = useState(initial?.riskNote ?? "");
  const [stopCondition, setStopCondition] = useState(initial?.stopCondition ?? "");
  const [referralCondition, setReferralCondition] = useState(initial?.referralCondition ?? "");
  const [reviewDate, setReviewDate] = useState(initial?.reviewDate?.slice(0, 10) ?? "");

  return (
    <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div>
        <label htmlFor="plan-title" className="mb-1 block text-base font-semibold text-slate-900">
          標題
        </label>
        <input
          id="plan-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
        />
      </div>
      <div>
        <label htmlFor="plan-baseline" className="mb-1 block text-base font-semibold text-slate-900">
          基準
        </label>
        <textarea
          id="plan-baseline"
          value={baseline}
          onChange={(e) => setBaseline(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
        />
      </div>
      <div>
        <label htmlFor="plan-risk" className="mb-1 block text-base font-semibold text-slate-900">
          風險
        </label>
        <textarea
          id="plan-risk"
          value={riskNote}
          onChange={(e) => setRiskNote(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
        />
      </div>
      <div>
        <label htmlFor="plan-stop" className="mb-1 block text-base font-semibold text-slate-900">
          停止條件
        </label>
        <textarea
          id="plan-stop"
          value={stopCondition}
          onChange={(e) => setStopCondition(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
        />
      </div>
      <div>
        <label htmlFor="plan-referral" className="mb-1 block text-base font-semibold text-slate-900">
          轉介條件
        </label>
        <textarea
          id="plan-referral"
          value={referralCondition}
          onChange={(e) => setReferralCondition(e.target.value)}
          rows={2}
          className="w-full rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
        />
      </div>
      <div>
        <label htmlFor="plan-review-date" className="mb-1 block text-base font-semibold text-slate-900">
          檢討日期
        </label>
        <input
          id="plan-review-date"
          type="date"
          value={reviewDate}
          onChange={(e) => setReviewDate(e.target.value)}
          className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
        />
      </div>
      <button
        type="button"
        onClick={() =>
          onSubmit({ title, baseline, riskNote, stopCondition, referralCondition, reviewDate })
        }
        disabled={!title.trim()}
        className="self-start rounded-lg bg-blue-700 px-4 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-50"
      >
        {submitLabel}
      </button>
    </div>
  );
}
