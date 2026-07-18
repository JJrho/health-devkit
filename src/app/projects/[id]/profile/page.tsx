"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FormMessage, TextareaField } from "@/components/auth/auth-ui";

/** 上游 §11.1（必要背景）＋§12.2（運動前必要資訊）；本輪自由文字承接，選項/驗證規則留待 E5-F1（A16） */
const NECESSARY_BACKGROUND_FIELDS: Array<{ key: string; label: string }> = [
  { key: "allergies", label: "過敏" },
  { key: "chronicConditions", label: "慢性疾病" },
  { key: "pregnancy", label: "懷孕／備孕狀態（若不適用可留空）" },
  { key: "medications", label: "目前用藥" },
  { key: "specialDiet", label: "特殊飲食" },
  { key: "religiousCultural", label: "宗教文化考量" },
  { key: "giDiscomfort", label: "腸胃道不適" },
  { key: "eatingDisorderRisk", label: "飲食失調風險（若不適用可留空）" },
  { key: "costAccess", label: "成本與可取得性考量" },
];

const EXERCISE_READINESS_FIELDS: Array<{ key: string; label: string }> = [
  { key: "recentActivity", label: "過去三個月的活動情況" },
  { key: "chestDiscomfort", label: "胸部不適（若無可留空）" },
  { key: "syncope", label: "昏厥病史（若無可留空）" },
  { key: "abnormalBreathlessness", label: "異常呼吸困難（若無可留空）" },
  { key: "muscleJointPain", label: "肌肉、肌腱或關節疼痛" },
  { key: "oldInjuries", label: "舊傷" },
  { key: "surgicalHistory", label: "手術史" },
  { key: "balanceFallHistory", label: "平衡與跌倒史" },
  { key: "doctorRestrictions", label: "醫師限制" },
  { key: "venueEquipment", label: "運動場地與器材" },
  { key: "userPreferences", label: "運動喜好" },
];

const ALL_FIELDS = [...NECESSARY_BACKGROUND_FIELDS, ...EXERCISE_READINESS_FIELDS];
const AUTOSAVE_DELAY_MS = 1500;

type LoadState = "loading" | "ready" | "unauthorized" | "denied" | "error";
type SaveState = "idle" | "saving" | "saved" | "conflict" | "error";

function emptyFormData(): Record<string, string> {
  return Object.fromEntries(ALL_FIELDS.map((field) => [field.key, ""]));
}

/** 個人健康背景表單（E1-F5，SDD §4.3）：autosave＋續編＋四層權限鏈由 API 端把關 */
export default function ProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [formData, setFormData] = useState<Record<string, string>>(emptyFormData());
  const [version, setVersion] = useState<number | undefined>(undefined);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  const saveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasLoaded = useRef(false);

  useEffect(() => {
    (async () => {
      try {
        const response = await fetch(`/api/projects/${projectId}/profile`);
        if (response.status === 401) {
          setLoadState("unauthorized");
          return;
        }
        if (response.status === 403) {
          setLoadState("denied");
          return;
        }
        if (!response.ok) {
          setLoadState("error");
          return;
        }
        const data = await response.json();
        if (data.profile) {
          setFormData({ ...emptyFormData(), ...data.profile.data });
          setVersion(data.profile.version);
        }
        hasLoaded.current = true;
        setLoadState("ready");
      } catch {
        setLoadState("error");
      }
    })();
  }, [projectId]);

  useEffect(() => {
    if (!hasLoaded.current || saveState === "conflict") return;
    if (saveTimer.current) clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(async () => {
      setSaveState("saving");
      try {
        const response = await fetch(`/api/projects/${projectId}/profile`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ data: formData, version }),
        });
        const body = await response.json();
        if (response.ok) {
          setVersion(body.profile.version);
          setSaveState("saved");
        } else if (body.error?.code === "VERSION_CONFLICT") {
          setSaveState("conflict");
        } else {
          setSaveState("error");
        }
      } catch {
        setSaveState("error");
      }
    }, AUTOSAVE_DELAY_MS);
    return () => {
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData]);

  function updateField(key: string, value: string) {
    setFormData((current) => ({ ...current, [key]: value }));
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6">
      <h1 className="mb-2 text-3xl font-bold text-slate-900">個人健康背景</h1>
      <p className="mb-6 text-lg text-slate-700">
        填寫的內容會自動儲存，離開後再回來會繼續顯示上次填寫的內容，不需另外送出。
      </p>

      {loadState === "loading" && <p className="text-lg text-slate-700">載入中…</p>}
      {loadState === "unauthorized" && (
        <>
          <FormMessage kind="error" text="請先登入才能填寫健康背景。" />
          <Link
            href="/login"
            className="mt-2 inline-block font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            前往登入
          </Link>
        </>
      )}
      {loadState === "denied" && (
        <FormMessage kind="error" text="你沒有權限查看這個健康專案。" />
      )}
      {loadState === "error" && (
        <FormMessage kind="error" text="連線發生問題，請確認網路後重新整理頁面。" />
      )}

      {loadState === "ready" && (
        <>
          <SaveStatusBanner state={saveState} />

          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">必要背景</h2>
            {NECESSARY_BACKGROUND_FIELDS.map((field) => (
              <TextareaField
                key={field.key}
                id={field.key}
                label={field.label}
                value={formData[field.key] ?? ""}
                onChange={(value) => updateField(field.key, value)}
              />
            ))}
          </section>

          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <h2 className="mb-4 text-2xl font-semibold text-slate-900">運動前必要資訊</h2>
            {EXERCISE_READINESS_FIELDS.map((field) => (
              <TextareaField
                key={field.key}
                id={field.key}
                label={field.label}
                value={formData[field.key] ?? ""}
                onChange={(value) => updateField(field.key, value)}
              />
            ))}
          </section>

          <Link
            href="/projects"
            className="inline-block font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            回專案列表
          </Link>
        </>
      )}
    </main>
  );
}

function SaveStatusBanner({ state }: { state: SaveState }) {
  if (state === "idle") return null;
  if (state === "conflict") {
    return (
      <FormMessage
        kind="error"
        text="這份背景資料已在其他分頁或裝置更新，請重新整理頁面以取得最新內容後再繼續編輯。"
      />
    );
  }
  if (state === "error") {
    return <FormMessage kind="error" text="自動儲存失敗，請確認網路後稍等片刻再試。" />;
  }
  return (
    <p role="status" aria-live="polite" className="mb-4 text-base text-slate-600">
      {state === "saving" ? "儲存中…" : "✓ 已自動儲存"}
    </p>
  );
}
