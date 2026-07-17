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
    | "confirmed"
    | "deleted";
}

type ExtractedItemStatus = "extracted" | "low_confidence" | "edited" | "accepted" | "rejected";

interface ExtractedItem {
  id: string;
  rawTestName: string;
  rawValue: string;
  rawUnit: string | null;
  rawReferenceRange: string | null;
  confidence: number;
  pageNumber: number;
  status: ExtractedItemStatus;
  version: number;
}

const DOCUMENT_STATUS_LABEL: Record<DocumentItem["status"], string> = {
  uploading: "上傳中",
  upload_failed: "上傳失敗",
  processing: "解析中",
  review_required: "待確認",
  processing_failed: "解析失敗",
  confirmed: "已確認",
  deleted: "已刪除",
};

const EXTRACTED_ITEM_STATUS_LABEL: Record<ExtractedItemStatus, string> = {
  extracted: "待審查",
  low_confidence: "待審查（低信心）",
  edited: "已編輯",
  accepted: "已接受",
  rejected: "已拒絕",
};

const REVIEWED_STATUSES = new Set<ExtractedItemStatus>(["edited", "accepted", "rejected"]);

const PREVIEWABLE_STATUSES = new Set<DocumentItem["status"]>([
  "processing",
  "review_required",
  "processing_failed",
  "confirmed",
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
                  onRefresh={loadDocuments}
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
  onRefresh,
}: {
  document: DocumentItem;
  projectId: string;
  onPreview: () => void;
  onDelete: () => void;
  onReprocess: () => void;
  onRefresh: () => void;
}) {
  const [showResults, setShowResults] = useState(false);
  const canShowResults =
    document.status === "review_required" ||
    document.status === "processing_failed" ||
    document.status === "confirmed";

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
      {showResults && (
        <ExtractionResults
          projectId={projectId}
          documentId={document.id}
          documentStatus={document.status}
          onConfirmed={onRefresh}
        />
      )}
    </li>
  );
}

/** E2-F3：解析結果——review_required 可互動（編輯/接受/拒絕/新增/刪除/確認），confirmed 唯讀回查 */
function ExtractionResults({
  projectId,
  documentId,
  documentStatus,
  onConfirmed,
}: {
  projectId: string;
  documentId: string;
  documentStatus: DocumentItem["status"];
  onConfirmed: () => void;
}) {
  const [items, setItems] = useState<ExtractedItem[] | null>(null);
  const [error, setError] = useState(false);
  const [message, setMessage] = useState<{ kind: "error" | "success" | null; text: string }>({
    kind: null,
    text: "",
  });
  const [confirming, setConfirming] = useState(false);
  const [showAddForm, setShowAddForm] = useState(false);

  const editable = documentStatus === "review_required";
  const base = `/api/projects/${projectId}/documents/${documentId}/extractions`;

  function loadItems() {
    fetch(base)
      .then((response) => (response.ok ? response.json() : Promise.reject()))
      .then((data) => setItems(data.items))
      .catch(() => setError(true));
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, documentId]);

  async function viewOriginalPage(pageNumber: number) {
    const response = await fetch(`/api/projects/${projectId}/documents/${documentId}/preview`);
    const body = await response.json();
    if (response.ok) {
      window.open(`${body.url}#page=${pageNumber}`, "_blank", "noopener,noreferrer");
    } else {
      setMessage({ kind: "error", text: "無法取得預覽連結，請再試一次。" });
    }
  }

  async function patchItem(
    itemId: string,
    payload: Record<string, unknown>,
  ): Promise<{ ok: boolean; errorMessage?: string }> {
    const response = await fetch(`${base}/${itemId}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    if (response.ok) {
      loadItems();
      return { ok: true };
    }
    const body = await response.json().catch(() => ({}));
    return { ok: false, errorMessage: body.error?.message ?? "更新失敗，請再試一次。" };
  }

  async function deleteItem(itemId: string) {
    if (!window.confirm("確定要刪除這一列嗎？")) return;
    const response = await fetch(`${base}/${itemId}`, { method: "DELETE" });
    if (response.ok) {
      loadItems();
    } else {
      setMessage({ kind: "error", text: "刪除失敗，請再試一次。" });
    }
  }

  async function addItem(fields: {
    rawTestName: string;
    rawValue: string;
    rawUnit: string;
    rawReferenceRange: string;
  }) {
    const response = await fetch(base, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        rawTestName: fields.rawTestName,
        rawValue: fields.rawValue,
        rawUnit: fields.rawUnit || null,
        rawReferenceRange: fields.rawReferenceRange || null,
      }),
    });
    if (response.ok) {
      setShowAddForm(false);
      loadItems();
    } else {
      const body = await response.json().catch(() => ({}));
      setMessage({ kind: "error", text: body.error?.message ?? "新增失敗，請再試一次。" });
    }
  }

  async function handleConfirm() {
    setConfirming(true);
    const response = await fetch(`/api/projects/${projectId}/documents/${documentId}/confirm`, {
      method: "POST",
    });
    setConfirming(false);
    if (response.ok) {
      setMessage({ kind: "success", text: "已確認，資料鎖定完成。" });
      onConfirmed();
    } else {
      const body = await response.json().catch(() => ({}));
      setMessage({ kind: "error", text: body.error?.message ?? "確認失敗，請再試一次。" });
    }
  }

  if (error) return <p className="mt-4 text-base text-red-700">無法載入解析結果。</p>;
  if (items === null) return <p className="mt-4 text-base text-slate-600">載入中…</p>;

  const allReviewed = items.length > 0 && items.every((item) => REVIEWED_STATUSES.has(item.status));

  return (
    <div className="mt-4">
      <FormMessage kind={message.kind} text={message.text} />
      {items.length === 0 ? (
        <p className="text-base text-slate-600">沒有辨識到任何檢驗數據列。</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left text-base">
            <thead>
              <tr className="border-b-2 border-slate-300">
                <th className="py-2 pr-4">項目</th>
                <th className="py-2 pr-4">數值</th>
                <th className="py-2 pr-4">單位</th>
                <th className="py-2 pr-4">參考區間</th>
                <th className="py-2 pr-4">信心值</th>
                <th className="py-2 pr-4">狀態</th>
                <th className="py-2 pr-4">原頁</th>
                {editable && <th className="py-2 pr-4">操作</th>}
              </tr>
            </thead>
            <tbody>
              {items.map((item) => (
                <ExtractionRow
                  key={item.id}
                  item={item}
                  editable={editable}
                  onSave={(fields) => patchItem(item.id, fields)}
                  onAccept={() => patchItem(item.id, { version: item.version, status: "accepted" })}
                  onReject={() => patchItem(item.id, { version: item.version, status: "rejected" })}
                  onDelete={() => deleteItem(item.id)}
                  onViewPage={() => viewOriginalPage(item.pageNumber)}
                />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editable && (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setShowAddForm((current) => !current)}
            className="rounded-lg border-2 border-slate-400 px-4 py-2 text-base font-semibold text-slate-700 focus:outline-none focus:ring-4 focus:ring-blue-200"
          >
            {showAddForm ? "取消新增" : "手動新增一列"}
          </button>
          <button
            type="button"
            disabled={!allReviewed || confirming}
            onClick={handleConfirm}
            className="rounded-lg bg-blue-700 px-4 py-2 text-base font-semibold text-white hover:bg-blue-800 focus:outline-none focus:ring-4 focus:ring-blue-300 disabled:cursor-not-allowed disabled:bg-slate-400"
            title={allReviewed ? "" : "所有列都要先編輯／接受／拒絕才能確認"}
          >
            {confirming ? "確認中…" : "確認"}
          </button>
          {!allReviewed && (
            <span className="text-base text-slate-600">還有候選列尚未處理，才能按下確認。</span>
          )}
        </div>
      )}

      {editable && showAddForm && <AddExtractedItemForm onSubmit={addItem} />}
    </div>
  );
}

function ExtractionRow({
  item,
  editable,
  onSave,
  onAccept,
  onReject,
  onDelete,
  onViewPage,
}: {
  item: ExtractedItem;
  editable: boolean;
  onSave: (fields: {
    version: number;
    rawTestName: string;
    rawValue: string;
    rawUnit: string | null;
    rawReferenceRange: string | null;
  }) => Promise<{ ok: boolean; errorMessage?: string }>;
  onAccept: () => Promise<{ ok: boolean; errorMessage?: string }>;
  onReject: () => Promise<{ ok: boolean; errorMessage?: string }>;
  onDelete: () => void;
  onViewPage: () => void;
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [draft, setDraft] = useState({
    rawTestName: item.rawTestName,
    rawValue: item.rawValue,
    rawUnit: item.rawUnit ?? "",
    rawReferenceRange: item.rawReferenceRange ?? "",
  });
  const [rowError, setRowError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    const result = await onSave({
      version: item.version,
      rawTestName: draft.rawTestName,
      rawValue: draft.rawValue,
      rawUnit: draft.rawUnit || null,
      rawReferenceRange: draft.rawReferenceRange || null,
    });
    setBusy(false);
    if (result.ok) {
      setIsEditing(false);
      setRowError(null);
    } else {
      setRowError(result.errorMessage ?? "更新失敗");
    }
  }

  async function act(action: () => Promise<{ ok: boolean; errorMessage?: string }>) {
    setBusy(true);
    const result = await action();
    setBusy(false);
    if (!result.ok) setRowError(result.errorMessage ?? "操作失敗");
  }

  if (isEditing) {
    return (
      <tr className="border-b border-slate-200 bg-blue-50">
        <td className="py-2 pr-4">
          <input
            value={draft.rawTestName}
            onChange={(e) => setDraft({ ...draft, rawTestName: e.target.value })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
        </td>
        <td className="py-2 pr-4">
          <input
            value={draft.rawValue}
            onChange={(e) => setDraft({ ...draft, rawValue: e.target.value })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
        </td>
        <td className="py-2 pr-4">
          <input
            value={draft.rawUnit}
            onChange={(e) => setDraft({ ...draft, rawUnit: e.target.value })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
        </td>
        <td className="py-2 pr-4">
          <input
            value={draft.rawReferenceRange}
            onChange={(e) => setDraft({ ...draft, rawReferenceRange: e.target.value })}
            className="w-full rounded border border-slate-300 px-2 py-1"
          />
        </td>
        <td className="py-2 pr-4">{item.confidence.toFixed(2)}</td>
        <td className="py-2 pr-4">{EXTRACTED_ITEM_STATUS_LABEL[item.status]}</td>
        <td className="py-2 pr-4">
          <button type="button" onClick={onViewPage} className="text-blue-700 underline">
            第 {item.pageNumber} 頁
          </button>
        </td>
        <td className="py-2 pr-4">
          <div className="flex flex-col gap-1">
            {rowError && <span className="text-sm text-red-700">{rowError}</span>}
            <div className="flex gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={save}
                className="rounded border-2 border-blue-700 px-3 py-1 text-sm font-semibold text-blue-700"
              >
                儲存
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsEditing(false)}
                className="rounded border-2 border-slate-400 px-3 py-1 text-sm font-semibold text-slate-700"
              >
                取消
              </button>
            </div>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-b border-slate-200">
      <td className="py-2 pr-4">{item.rawTestName}</td>
      <td className="py-2 pr-4">{item.rawValue}</td>
      <td className="py-2 pr-4">
        {item.rawUnit ?? <span className="italic text-slate-400">無法辨識</span>}
      </td>
      <td className="py-2 pr-4">
        {item.rawReferenceRange ?? <span className="italic text-slate-400">無法辨識</span>}
      </td>
      <td className="py-2 pr-4">
        {item.confidence < 0.85 ? (
          <span className="rounded-full border-2 border-amber-400 bg-amber-50 px-2 py-0.5 text-amber-800">
            待確認（{item.confidence.toFixed(2)}）
          </span>
        ) : (
          item.confidence.toFixed(2)
        )}
      </td>
      <td className="py-2 pr-4">{EXTRACTED_ITEM_STATUS_LABEL[item.status]}</td>
      <td className="py-2 pr-4">
        <button type="button" onClick={onViewPage} className="text-blue-700 underline">
          第 {item.pageNumber} 頁
        </button>
      </td>
      {editable && (
        <td className="py-2 pr-4">
          <div className="flex flex-col gap-1">
            {rowError && <span className="text-sm text-red-700">{rowError}</span>}
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => setIsEditing(true)}
                className="rounded border-2 border-slate-400 px-3 py-1 text-sm font-semibold text-slate-700"
              >
                編輯
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(onAccept)}
                className="rounded border-2 border-emerald-600 px-3 py-1 text-sm font-semibold text-emerald-700"
              >
                接受
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() => act(onReject)}
                className="rounded border-2 border-amber-600 px-3 py-1 text-sm font-semibold text-amber-700"
              >
                拒絕
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={onDelete}
                className="rounded border-2 border-red-400 px-3 py-1 text-sm font-semibold text-red-700"
              >
                刪除
              </button>
            </div>
          </div>
        </td>
      )}
    </tr>
  );
}

function AddExtractedItemForm({
  onSubmit,
}: {
  onSubmit: (fields: {
    rawTestName: string;
    rawValue: string;
    rawUnit: string;
    rawReferenceRange: string;
  }) => void;
}) {
  const [fields, setFields] = useState({
    rawTestName: "",
    rawValue: "",
    rawUnit: "",
    rawReferenceRange: "",
  });

  return (
    <div className="mt-3 flex flex-wrap items-end gap-3 rounded-lg border-2 border-slate-300 p-4">
      <label className="flex flex-col text-sm text-slate-700">
        項目名稱
        <input
          value={fields.rawTestName}
          onChange={(e) => setFields({ ...fields, rawTestName: e.target.value })}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col text-sm text-slate-700">
        數值
        <input
          value={fields.rawValue}
          onChange={(e) => setFields({ ...fields, rawValue: e.target.value })}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col text-sm text-slate-700">
        單位（選填）
        <input
          value={fields.rawUnit}
          onChange={(e) => setFields({ ...fields, rawUnit: e.target.value })}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <label className="flex flex-col text-sm text-slate-700">
        參考區間（選填）
        <input
          value={fields.rawReferenceRange}
          onChange={(e) => setFields({ ...fields, rawReferenceRange: e.target.value })}
          className="rounded border border-slate-300 px-2 py-1"
        />
      </label>
      <button
        type="button"
        disabled={!fields.rawTestName.trim() || !fields.rawValue.trim()}
        onClick={() => onSubmit(fields)}
        className="rounded-lg bg-blue-700 px-4 py-2 text-base font-semibold text-white hover:bg-blue-800 disabled:cursor-not-allowed disabled:bg-slate-400"
      >
        新增
      </button>
    </div>
  );
}
