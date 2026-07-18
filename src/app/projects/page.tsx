"use client";

import { useEffect, useState } from "react";
import { FormMessage, SubmitButton, TextField } from "@/components/auth/auth-ui";

interface Project {
  id: string;
  name: string;
  version: number;
  archivedAt: string | null;
  deletedAt: string | null;
}

type LoadState = "loading" | "ready" | "unauthorized" | "error";

/** 專案列表／建立／改名／封存／還原／刪除（E1-F4，SDD §4.2；四層權限鏈套用於各操作） */
export default function ProjectsPage() {
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<Project[]>([]);
  const [mostRecentId, setMostRecentId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({
    kind: null,
    text: "",
  });

  async function loadProjects() {
    try {
      const response = await fetch("/api/projects");
      if (response.status === 401) {
        setLoadState("unauthorized");
        return;
      }
      if (!response.ok) {
        setLoadState("error");
        return;
      }
      const data = await response.json();
      setItems(data.items);
      setMostRecentId(data.mostRecentProjectId);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadProjects();
  }, []);

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">我的健康專案</h1>

      {loadState === "loading" && <p className="text-lg text-slate-700">載入中…</p>}

      {loadState === "unauthorized" && (
        <FormMessage kind="error" text="請先登入才能查看您的健康專案。" />
      )}
      {loadState === "unauthorized" && (
        <a
          href="/login"
          className="mt-2 inline-block font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          前往登入
        </a>
      )}

      {loadState === "error" && (
        <FormMessage kind="error" text="連線發生問題，請確認網路後重新整理頁面。" />
      )}

      {loadState === "ready" && (
        <>
          <FormMessage kind={message.kind} text={message.text} />
          <CreateProjectForm
            onCreated={() => {
              setMessage({ kind: "success", text: "專案已建立。" });
              loadProjects();
            }}
            onError={(text) => setMessage({ kind: "error", text })}
          />

          {items.length === 0 ? (
            <p className="mt-6 text-lg text-slate-700">
              目前還沒有任何健康專案，建立一個開始吧！
            </p>
          ) : (
            <ul className="mt-6 flex flex-col gap-4">
              {items.map((project) => (
                <ProjectRow
                  key={project.id}
                  project={project}
                  isMostRecent={project.id === mostRecentId}
                  onChanged={(text) => {
                    setMessage({ kind: "success", text });
                    loadProjects();
                  }}
                  onError={(text) => setMessage({ kind: "error", text })}
                />
              ))}
            </ul>
          )}
        </>
      )}
    </main>
  );
}

function CreateProjectForm({
  onCreated,
  onError,
}: {
  onCreated: () => void;
  onError: (text: string) => void;
}) {
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch("/api/projects", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const data = await response.json();
      if (response.ok) {
        setName("");
        onCreated();
      } else {
        onError(data.error?.message ?? "建立失敗，請再試一次。");
      }
    } catch {
      onError("連線發生問題，請確認網路後再試一次。");
    } finally {
      setPending(false);
    }
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="mb-2 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm"
    >
      <TextField id="new-project-name" label="新增專案名稱" type="text" value={name} onChange={setName} />
      <SubmitButton pending={pending}>建立專案</SubmitButton>
    </form>
  );
}

function ProjectRow({
  project,
  isMostRecent,
  onChanged,
  onError,
}: {
  project: Project;
  isMostRecent: boolean;
  onChanged: (text: string) => void;
  onError: (text: string) => void;
}) {
  const [renaming, setRenaming] = useState(false);
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState(false);
  const isArchived = Boolean(project.archivedAt);

  async function call(path: string, init: RequestInit, successText: string) {
    if (pending) return;
    setPending(true);
    try {
      const response = await fetch(path, init);
      const data = await response.json();
      if (response.ok) {
        onChanged(successText);
      } else if (data.error?.code === "VERSION_CONFLICT") {
        onError("此專案已在其他位置更新，請重新整理後再試一次。");
      } else {
        onError(data.error?.message ?? "操作失敗，請再試一次。");
      }
    } catch {
      onError("連線發生問題，請確認網路後再試一次。");
    } finally {
      setPending(false);
    }
  }

  async function handleRename(event: React.FormEvent) {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;
    await call(
      `/api/projects/${project.id}`,
      {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name: trimmed, version: project.version }),
      },
      "專案名稱已更新。",
    );
    setRenaming(false);
  }

  function handleArchive() {
    if (!window.confirm(`確定要封存「${project.name}」嗎？封存後可隨時還原。`)) return;
    call(`/api/projects/${project.id}/archive`, { method: "POST" }, "專案已封存。");
  }

  function handleRestore() {
    call(`/api/projects/${project.id}/restore`, { method: "POST" }, "專案已還原。");
  }

  function handleDelete() {
    if (
      !window.confirm(`確定要刪除「${project.name}」嗎？刪除後將無法從列表中看到此專案。`)
    )
      return;
    call(`/api/projects/${project.id}`, { method: "DELETE" }, "專案已刪除。");
  }

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      {renaming ? (
        <form onSubmit={handleRename} noValidate>
          <TextField
            id={`rename-${project.id}`}
            label="專案名稱"
            type="text"
            value={name}
            onChange={setName}
          />
          <div className="flex gap-3">
            <SubmitButton pending={pending}>儲存</SubmitButton>
            <button
              type="button"
              onClick={() => {
                setName(project.name);
                setRenaming(false);
              }}
              className="rounded-lg border-2 border-slate-400 px-6 py-4 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              取消
            </button>
          </div>
        </form>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="text-2xl font-semibold text-slate-900">{project.name}</h2>
            {isArchived && (
              <span className="rounded-full border-2 border-amber-400 bg-amber-50 px-3 py-1 text-base text-amber-800">
                已封存
              </span>
            )}
            {isMostRecent && (
              <span className="rounded-full border-2 border-blue-400 bg-blue-50 px-3 py-1 text-base text-blue-800">
                最近使用
              </span>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <a
              href={`/projects/${project.id}/profile`}
              className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              個人健康背景
            </a>
            <a
              href={`/projects/${project.id}/documents`}
              className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              健檢文件
            </a>
            <a
              href={`/projects/${project.id}/trends`}
              className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              趨勢分析
            </a>
            {!isArchived && (
              <button
                type="button"
                disabled={pending}
                onClick={() => setRenaming(true)}
                className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                改名
              </button>
            )}
            {isArchived ? (
              <button
                type="button"
                disabled={pending}
                onClick={handleRestore}
                className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                還原
              </button>
            ) : (
              <button
                type="button"
                disabled={pending}
                onClick={handleArchive}
                className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
              >
                封存
              </button>
            )}
            <button
              type="button"
              disabled={pending}
              onClick={handleDelete}
              className="rounded-lg border-2 border-red-400 px-5 py-3 text-lg font-semibold text-red-700 focus:outline-none focus:ring-4 focus:ring-red-200 disabled:cursor-not-allowed disabled:opacity-50"
            >
              刪除
            </button>
          </div>
        </>
      )}
    </li>
  );
}
