"use client";

import { use, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { FormMessage } from "@/components/auth/auth-ui";

interface ConversationSummary {
  id: string;
  updatedAt: string;
}

interface MessageView {
  id: string;
  role: string;
  content: string | null;
  status: string;
  errorCode: string | null;
  citations: Array<{ citationType: string; citedText: string }>;
}

type LoadState = "loading" | "ready" | "unauthorized" | "denied" | "error";

const SAFETY_NOTICE_TEXT: Record<string, string> = {
  AI_INSUFFICIENT_DATA: "目前的資料還不足以回答這個問題，建議補充更多健檢資料後再試。",
  DIAGNOSTIC_LANGUAGE_DETECTED:
    "這則回答可能包含較強烈的醫療判斷用語，請將其視為參考資訊，實際情況仍需諮詢專業醫師。",
};

/** E4-F3 PoC 2/2（SDD §4.9）：串流問答對話頁，本輪僅顯示最新版本訊息（A78） */
export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: projectId } = use(params);

  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [conversationList, setConversationList] = useState<ConversationSummary[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messageList, setMessageList] = useState<MessageView[]>([]);
  const [inputText, setInputText] = useState("");
  const [sending, setSending] = useState(false);
  const [streamingMessageId, setStreamingMessageId] = useState<string | null>(null);
  const [streamingContent, setStreamingContent] = useState("");
  const [safetyNotices, setSafetyNotices] = useState<string[]>([]);
  const [errorText, setErrorText] = useState("");
  const abortReaderRef = useRef<ReadableStreamDefaultReader<Uint8Array> | null>(null);

  useEffect(() => {
    fetch(`/api/projects/${projectId}/conversations`)
      .then((response) => {
        if (response.status === 401) return setLoadState("unauthorized");
        if (response.status === 403) return setLoadState("denied");
        if (!response.ok) return setLoadState("error");
        return response.json().then((data: { conversations: ConversationSummary[] }) => {
          setConversationList(data.conversations);
          setLoadState("ready");
          if (data.conversations[0]) setConversationId(data.conversations[0].id);
        });
      })
      .catch(() => setLoadState("error"));
  }, [projectId]);

  useEffect(() => {
    if (!conversationId) {
      setMessageList([]);
      return;
    }
    reloadMessages(conversationId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conversationId]);

  async function reloadMessages(id: string) {
    const response = await fetch(`/api/projects/${projectId}/conversations/${id}/messages`);
    if (response.ok) {
      const data = (await response.json()) as { messages: MessageView[] };
      setMessageList(data.messages);
    }
  }

  async function createNewConversation() {
    const response = await fetch(`/api/projects/${projectId}/conversations`, { method: "POST" });
    if (!response.ok) return setErrorText("建立對話失敗，請再試一次。");
    const data = (await response.json()) as { conversationId: string };
    setConversationList((prev) => [{ id: data.conversationId, updatedAt: new Date().toISOString() }, ...prev]);
    setConversationId(data.conversationId);
  }

  async function consumeStream(url: string, assistantMessageId: string) {
    setStreamingMessageId(assistantMessageId);
    setStreamingContent("");
    setSafetyNotices([]);

    const response = await fetch(url);
    const reader = response.body!.getReader();
    abortReaderRef.current = reader;
    const decoder = new TextDecoder();
    let buffer = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const parts = buffer.split("\n\n");
      buffer = parts.pop() ?? "";
      for (const part of parts) {
        if (!part.startsWith("data: ")) continue;
        const event = JSON.parse(part.slice(6)) as { type: string; delta?: string; code?: string };
        if (event.type === "content_delta" && event.delta) {
          setStreamingContent((prev) => prev + event.delta);
        } else if (event.type === "safety_notice" && event.code) {
          setSafetyNotices((prev) => (prev.includes(event.code!) ? prev : [...prev, event.code!]));
        } else if (event.type === "stream_completed" || event.type === "stream_cancelled" || event.type === "stream_failed") {
          setStreamingMessageId(null);
          if (conversationId) await reloadMessages(conversationId);
        }
      }
    }
    abortReaderRef.current = null;
  }

  async function handleSend() {
    if (!conversationId || !inputText.trim() || sending) return;
    setSending(true);
    setErrorText("");
    const questionText = inputText;
    setInputText("");

    const response = await fetch(`/api/projects/${projectId}/conversations/${conversationId}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: questionText }),
    });
    setSending(false);

    if (response.status === 429) {
      setErrorText("今天已經問了不少問題了，明天再繼續聊聊吧！");
      return;
    }
    if (!response.ok) {
      setErrorText("送出問題時發生問題，請再試一次。");
      return;
    }

    const data = (await response.json()) as { messageId: string };
    await reloadMessages(conversationId);
    await consumeStream(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${data.messageId}/stream`,
      data.messageId,
    );
  }

  async function handleCancel() {
    if (!streamingMessageId) return;
    await fetch(`/api/projects/${projectId}/messages/${streamingMessageId}/cancel`, { method: "POST" });
  }

  async function handleRegenerate(oldMessageId: string) {
    if (!conversationId || sending || streamingMessageId) return;
    const response = await fetch(`/api/projects/${projectId}/messages/${oldMessageId}/regenerate`, {
      method: "POST",
    });
    if (!response.ok) return setErrorText("重新產生失敗，請再試一次。");
    const data = (await response.json()) as { messageId: string };
    await consumeStream(
      `/api/projects/${projectId}/conversations/${conversationId}/messages/${data.messageId}/stream`,
      data.messageId,
    );
  }

  return (
    <main className="mx-auto min-h-screen max-w-3xl bg-slate-50 p-6">
      <h1 className="mb-6 text-3xl font-bold text-slate-900">健康問答</h1>

      {loadState === "loading" && <p className="text-lg text-slate-700">載入中…</p>}
      {loadState === "unauthorized" && <FormMessage kind="error" text="請先登入。" />}
      {loadState === "denied" && <FormMessage kind="error" text="你沒有權限查看這個健康專案。" />}
      {loadState === "error" && (
        <FormMessage kind="error" text="連線發生問題，請確認網路後重新整理頁面。" />
      )}

      {loadState === "ready" && (
        <>
          <div className="mb-4 flex flex-wrap items-center gap-3">
            <label htmlFor="conversation-select" className="text-lg font-medium text-slate-900">
              對話：
            </label>
            <select
              id="conversation-select"
              value={conversationId ?? ""}
              onChange={(event) => setConversationId(event.target.value || null)}
              className="rounded-lg border border-slate-300 p-2 text-base focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              {conversationList.length === 0 && <option value="">（尚無對話）</option>}
              {conversationList.map((c, i) => (
                <option key={c.id} value={c.id}>
                  對話 {conversationList.length - i}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={createNewConversation}
              className="rounded-lg bg-blue-700 px-4 py-2 text-base font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
            >
              建立新對話
            </button>
          </div>

          {errorText && <FormMessage kind="error" text={errorText} />}

          <div className="mb-4 flex flex-col gap-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm" aria-live="polite">
            {messageList.length === 0 && !streamingMessageId && (
              <p className="text-lg text-slate-700">選擇或建立對話後，在下方輸入問題開始提問。</p>
            )}
            {messageList.map((m) => (
              <MessageBubble key={m.id} message={m} onRegenerate={handleRegenerate} />
            ))}
            {streamingMessageId && (
              <div className="rounded-xl bg-slate-100 p-4">
                <p className="mb-1 text-base font-semibold text-slate-700">健康資訊助理</p>
                <p className="whitespace-pre-wrap text-lg text-slate-900">{streamingContent || "思考中…"}</p>
                {safetyNotices.map((code) => (
                  <p
                    key={code}
                    role="alert"
                    className="mt-2 rounded-lg border-2 border-amber-600 bg-amber-50 p-3 text-base font-medium text-amber-900"
                  >
                    ⚠ {SAFETY_NOTICE_TEXT[code] ?? code}
                  </p>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-col gap-3 sm:flex-row">
            <label htmlFor="question-input" className="sr-only">
              輸入問題
            </label>
            <textarea
              id="question-input"
              value={inputText}
              onChange={(event) => setInputText(event.target.value)}
              disabled={!conversationId || Boolean(streamingMessageId)}
              placeholder="輸入你想問的健康問題……"
              rows={2}
              className="flex-1 rounded-lg border border-slate-300 p-3 text-lg focus:outline-none focus:ring-4 focus:ring-blue-200"
            />
            {streamingMessageId ? (
              <button
                type="button"
                onClick={handleCancel}
                className="rounded-lg bg-slate-700 px-6 py-3 text-lg font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200"
              >
                取消
              </button>
            ) : (
              <button
                type="button"
                onClick={handleSend}
                disabled={!conversationId || !inputText.trim() || sending}
                className="rounded-lg bg-blue-700 px-6 py-3 text-lg font-semibold text-white focus:outline-none focus:ring-4 focus:ring-blue-200 disabled:opacity-50"
              >
                送出
              </button>
            )}
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

function MessageBubble({
  message,
  onRegenerate,
}: {
  message: MessageView;
  onRegenerate: (messageId: string) => void;
}) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "rounded-xl bg-blue-50 p-4" : "rounded-xl bg-slate-100 p-4"}>
      <p className="mb-1 text-base font-semibold text-slate-700">{isUser ? "我" : "健康資訊助理"}</p>
      {message.status === "blocked" || message.status === "failed" ? (
        <p className="text-lg text-slate-700">
          {message.errorCode === "AI_INSUFFICIENT_DATA"
            ? SAFETY_NOTICE_TEXT.AI_INSUFFICIENT_DATA
            : "這則回答發生問題，請按下方按鈕重新產生。"}
        </p>
      ) : (
        <p className="whitespace-pre-wrap text-lg text-slate-900">{message.content}</p>
      )}

      {message.citations.length > 0 && (
        <div className="mt-3 border-t border-slate-300 pt-3">
          <p className="mb-1 text-base font-semibold text-slate-700">引用來源</p>
          <ul className="list-disc pl-5 text-base text-slate-700">
            {message.citations.map((c, i) => (
              <li key={i}>{c.citedText}</li>
            ))}
          </ul>
        </div>
      )}

      {!isUser && message.status !== "queued" && message.status !== "streaming" && (
        <button
          type="button"
          onClick={() => onRegenerate(message.id)}
          className="mt-3 text-base font-semibold text-blue-700 underline focus:outline-none focus:ring-4 focus:ring-blue-200"
        >
          重新產生
        </button>
      )}
    </div>
  );
}
