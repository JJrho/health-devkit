"use client";

import { use, useEffect, useRef, useState } from "react";
import { FormMessage } from "@/components/auth/auth-ui";

interface DocumentItem {
  id: string;
  filename: string;
  mimeType: string | null;
  sizeBytes: number | null;
  status:
    | "uploading"
    | "upload_failed"
    | "processing"
    | "review_required"
    | "processing_failed"
    | "deleted";
}

interface ExtractedItem {
  id: string;
  rawTestName: string;
  rawValue: string;
  rawUnit: string | null;
  rawReferenceRange: string | null;
  confidence: number;
  pageNumber: number;
}

const DOCUMENT_STATUS_LABEL: Record<DocumentItem["status"], string> = {
  uploading: "上傳中",
  upload_failed: "上傳失敗",
  processing: "解析中",
  review_required: "待確認",
  processing_failed: "解析失敗",
  deleted: "已刪除",
};

const PREVIEWABLE_STATUSES = new Set<DocumentItem["status"]>([
  "processing",
  "review_required",
  "processing_failed",
]);

type LoadState = "loading" | "ready" | "unauthorized" | "denied" | "error";

interface PendingUpload {
  file: File;
  idempotencyKey: string;
  documentId?: string;
  stage: "idle" | "uploading" | "error";
  errorMessage?: string;
  previewUrl: string | null;
}

const ACCEPTED_EXTENSIONS = ".pdf,.jpg,.jpeg,.png";

function formatBytes(bytes: number | null): string {
  if (bytes === null) return "—";
  if (bytes < 1024 * 1024) return `${Math.ceil(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** 文件上傳與列表（E2-F1，SDD §4.4）：先預覽後上傳、可取消、失敗可換檔重試 */
export default function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [items, setItems] = useState<DocumentItem[]>([]);
  const [pending, setPending] = useState<PendingUpload | null>(null);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({
    kind: null,
    text: "",
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function loadDocuments() {
    try {
      const response = await fetch(`/api/projects/${projectId}/documents`);
      if (response.status === 401) return setLoadState("unauthorized");
      if (response.status === 403) return setLoadState("denied");
      if (!response.ok) return setLoadState("error");
      const data = await response.json();
      setItems(data.items);
      setLoadState("ready");
    } catch {
      setLoadState("error");
    }
  }

  useEffect(() => {
    loadDocuments();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  function handleFileSelect(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const previewUrl = file.type.startsWith("image/") ? URL.createObjectURL(file) : null;
    setPending({
      file,
      idempotencyKey: crypto.randomUUID(),
      stage: "idle",
      previewUrl,
    });
    setMessage({ kind: null, text: "" });
  }

  async function startUpload() {
    if (!pending) return;
    setPending({ ...pending, stage: "uploading", errorMessage: undefined });
    try {
      let documentId = pending.documentId;
      if (!documentId) {
        const sessionResponse = await fetch(
          `/api/projects/${projectId}/documents/upload-sessions`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
              idempotencyKey: pending.idempotencyKey,
              filename: pending.file.name,
            }),
          },
        );
        const sessionBody = await sessionResponse.json();
        if (!sessionResponse.ok) {
          setPending((current) =>
            current ? { ...current, stage: "error", errorMessage: sessionBody.error?.message } : current,
          );
          return;
        }
        documentId = sessionBody.document.id;
        setPending((current) => (current ? { ...current, documentId } : current));
      }

      const partResponse = await fetch(
        `/api/projects/${projectId}/documents/${documentId}/parts/1`,
        { method: "PUT", body: pending.file },
      );
      if (!partResponse.ok) {
        const body = await partResponse.json();
        setPending((current) =>
          current ? { ...current, stage: "error", errorMessage: body.error?.message } : current,
        );
        return;
      }

      const completeResponse = await fetch(
        `/api/projects/${projectId}/documents/${documentId}/complete`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ totalParts: 1 }),
        },
      );
      const completeBody = await completeResponse.json();
      if (!completeResponse.ok) {
        setPending((current) =>
          current ? { ...current, stage: "error", errorMessage: completeBody.error?.message } : current,
        );
        return;
      }

      if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
      setPending(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      setMessage({ kind: "success", text: "文件已上傳完成。" });
      loadDocuments();
    } catch {
      setPending((current) =>
        current ? { ...current, stage: "error", errorMessage: "連線發生問題，請確認網路後再試一次。" } : current,
      );
    }
  }

  async function cancelUpload() {
    if (!pending) return;
    if (pending.documentId) {
      await fetch(`/api/projects/${projectId}/documents/${pending.documentId}`, {
        method: "DELETE",
      }).catch(() => undefined);
    }
    if (pending.previewUrl) URL.revokeObjectURL(pending.previewUrl);
    setPending(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
    loadDocuments();
  }

  async function handleDelete(documentId: string) {
    if (!window.confirm("確定要刪除這份文件嗎？")) return;
    const response = await fetch(`/api/projects/${projectId}/documents/${documentId}`, {
      method: "DELETE",
    });
    if (response.ok) {
      setMessage({ kind: "success", text: "文件已刪除。" });
      loadDocuments();
    } else {
      setMessage({ kind: "error", text: "刪除失敗，請再試一次。" });
    }
  }

  async function handlePreview(documentId: string) {
    const response = await fetch(`/api/projects/${projectId}/documents/${documentId}/preview`);
    const body = await response.json();
    if (response.ok) {
      window.open(body.url, "_blank", "noopener,noreferrer");
    } else {
      setMessage({ kind: "error", text: "無法取得預覽連結，請再試一次。" });
    }
  }

  async function handleReprocess(documentId: string) {
    const response = await fetch(`/api/projects/${projectId}/documents/${documentId}/reprocess`, {
      method: "POST",
    });
    if (response.ok) {
      setMessage({ kind: "success", text: "已重新排入解析，稍後重新整理查看結果。" });
      loadDocuments();
    } else {
      setMessage({ kind: "error", text: "重新解析失敗，請再試一次。" });
    }
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">健檢文件</h1>

      {loadState === "loading" && <p className="text-lg text-slate-700">載入中…</p>}
      {loadState === "unauthorized" && <FormMessage kind="error" text="請先登入。" />}
      {loadState === "denied" && (
        <FormMessage kind="error" text="你沒有權限查看這個健康專案。" />
      )}
      {loadState === "error" && (
        <FormMessage kind="error" text="連線發生問題，請確認網路後重新整理頁面。" />
      )}

      {loadState === "ready" && (
        <>
          <FormMessage kind={message.kind} text={message.text} />

          <section className="mb-8 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
            <label htmlFor="file-input" className="mb-2 block text-lg font-medium text-slate-900">
              選擇要上傳的檔案（PDF、JPG、PNG，單檔上限 20MB）
            </label>
            <input
              id="file-input"
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_EXTENSIONS}
              onChange={handleFileSelect}
              className="mb-4 block w-full text-lg"
            />

            {pending && (
              <div className="rounded-lg border-2 border-slate-300 p-4">
                {pending.previewUrl ? (
                  <img
                    src={pending.previewUrl}
                    alt="上傳前預覽"
                    className="mb-3 max-h-64 rounded-lg object-contain"
                  />
                ) : (
                  <p className="mb-3 text-lg text-slate-700">
                    📄 {pending.file.name}（{formatBytes(pending.file.size)}）
                  </p>
                )}

                {pending.stage === "error" && (
                  <FormMessage
                    kind="error"
                    text={pending.errorMessage ?? "上傳失敗，請確認檔案後再試一次。"}
                  />
                )}

                <div className="flex gap-3">
                  <button
                    type="button"
                    disabled={pending.stage === "uploading"}
                    onClick={startUpload}
                    className="rounded-lg bg-blue-700 px-6 py-4 text-xl font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-400"
                  >
                    {pending.stage === "uploading"
                      ? "上傳中，請稍候…"
                      : pending.stage === "error"
                        ? "重試上傳"
                        : "開始上傳"}
                  </button>
                  <button
                    type="button"
                    disabled={pending.stage === "uploading"}
                    onClick={cancelUpload}
                    className="rounded-lg border-2 border-slate-400 px-6 py-4 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    取消
                  </button>
                </div>
              </div>
            )}
          </section>

          {items.length === 0 ? (
            <p className="text-lg text-slate-700">目前還沒有上傳任何文件。</p>
          ) : (
            <ul className="flex flex-col gap-4">
              {items.map((document) => (
                <DocumentRow
                  key={document.id}
                  document={document}
                  projectId={projectId}
                  onPreview={() => handlePreview(document.id)}
                  onDelete={() => handleDelete(document.id)}
                  onReprocess={() => handleReprocess(document.id)}
                />
              ))}
            </ul>
          )}

          <a
            href="/projects"
            className="mt-8 inline-block font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            回專案列表
          </a>
        </>
      )}
    </main>
  );
}

function DocumentRow({
  document,
  projectId,
  onPreview,
  onDelete,
  onReprocess,
}: {
  document: DocumentItem;
  projectId: string;
  onPreview: () => void;
  onDelete: () => void;
  onReprocess: () => void;
}) {
  const [showResults, setShowResults] = useState(false);
  const canShowResults =
    document.status === "review_required" || document.status === "processing_failed";

  return (
    <li className="rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xl font-semibold text-slate-900">{document.filename}</p>
          <p className="text-base text-slate-600">
            {formatBytes(document.sizeBytes)} · {DOCUMENT_STATUS_LABEL[document.status]}
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          {PREVIEWABLE_STATUSES.has(document.status) && (
            <button
              type="button"
              onClick={onPreview}
              className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              預覽
            </button>
          )}
          {canShowResults && (
            <button
              type="button"
              onClick={() => setShowResults((current) => !current)}
              className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              {showResults ? "隱藏解析結果" : "查看解析結果"}
            </button>
          )}
          {document.status === "processing_failed" && (
            <button
              type="button"
              onClick={onReprocess}
              className="rounded-lg border-2 border-slate-400 px-5 py-3 text-lg font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              重新解析
            </button>
          )}
          <button
            type="button"
            onClick={onDelete}
            className="rounded-lg border-2 border-red-400 px-5 py-3 text-lg font-semibold text-red-700 focus:outline-none focus:ring-4 focus:ring-red-200"
          >
            刪除
          </button>
        </div>
      </div>
      {showResults && <ExtractionResults projectId={projectId} documentId={document.id} />}
    </li>
  );
}

/** 唯讀解析結果（PoC 檢視用；編輯/確認留待 E2-F3） */
function ExtractionResults({ projectId, documentId }: { projectId: string; documentId: string }) {
  const [items, setItems] = useState<ExtractedItem[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/documents/${documentId}/extractions`)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setItems(data.items))
      .catch(() => setError(true));
  }, [projectId, documentId]);

  if (error) return <p className="mt-4 text-base text-red-700">無法載入解析結果。</p>;
  if (items === null) return <p className="mt-4 text-base text-slate-600">載入中…</p>;
  if (items.length === 0) {
    return <p className="mt-4 text-base text-slate-600">沒有辨識到任何檢驗數據列。</p>;
  }

  return (
    <div className="mt-4 overflow-x-auto">
      <table className="w-full border-collapse text-left text-base">
        <thead>
          <tr className="border-b-2 border-slate-300">
            <th className="py-2 pr-4">項目</th>
            <th className="py-2 pr-4">數值</th>
            <th className="py-2 pr-4">單位</th>
            <th className="py-2 pr-4">參考區間</th>
            <th className="py-2 pr-4">信心值</th>
            <th className="py-2 pr-4">頁碼</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id} className="border-b border-slate-200">
              <td className="py-2 pr-4">{item.rawTestName}</td>
              <td className="py-2 pr-4">{item.rawValue}</td>
              <td className="py-2 pr-4">{item.rawUnit ?? "—"}</td>
              <td className="py-2 pr-4">{item.rawReferenceRange ?? "—"}</td>
              <td className="py-2 pr-4">
                {item.confidence < 0.85 ? (
                  <span className="rounded-full border-2 border-amber-400 bg-amber-50 px-2 py-0.5 text-amber-800">
                    待確認（{item.confidence.toFixed(2)}）
                  </span>
                ) : (
                  item.confidence.toFixed(2)
                )}
              </td>
              <td className="py-2 pr-4">{item.pageNumber}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
