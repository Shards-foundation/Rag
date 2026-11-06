'use client';

import { trpc } from "../../../lib/trpc";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { useAuth, useUser } from "@clerk/nextjs";
import Link from "next/link";
import { AlertCircle, FileText, MessageSquare, Plus, Send } from "lucide-react";

type Citation = { documentId: string; title: string; chunkIndex: number; score: number; excerpt?: string };
type Message = { role: "USER" | "ASSISTANT"; content: string; sources?: Citation[] | null };
type SseEvent = { event: string; data: Record<string, unknown> };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseSseBlock(block: string): SseEvent | null {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0) return null;
  try {
    const data: unknown = JSON.parse(dataLines.join("\n"));
    return isRecord(data) ? { event, data } : null;
  } catch {
    return null;
  }
}

function parseCitations(value: unknown): Citation[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item): Citation[] => {
    if (!isRecord(item)
      || typeof item.documentId !== "string"
      || typeof item.title !== "string"
      || !Number.isInteger(item.chunkIndex)
      || typeof item.score !== "number"
      || !Number.isFinite(item.score)) return [];
    return [{ documentId: item.documentId, title: item.title, chunkIndex: item.chunkIndex as number, score: item.score, ...(typeof item.excerpt === "string" ? { excerpt: item.excerpt.slice(0, 800) } : {}) }];
  });
}

const EMPTY_PENDING: { sessionId: string | null; items: Message[] } = { sessionId: null, items: [] };

export default function ChatPage() {
  const { user } = useUser();
  const { getToken } = useAuth();
  const utils = trpc.useUtils();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [pending, setPending] = useState(EMPTY_PENDING);
  const [input, setInput] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessions = trpc.chat.listSessions.useQuery();
  const createSession = trpc.chat.createSession.useMutation();
  const activeSessionId = selectedSessionId ?? sessions.data?.[0]?.id ?? null;
  const history = trpc.chat.getHistory.useQuery(
    { sessionId: activeSessionId ?? "00000000-0000-4000-8000-000000000000" },
    { enabled: Boolean(activeSessionId) },
  );
  const persistedMessages: Message[] = useMemo(() => (history.data ?? []).map((message) => ({
    role: message.role,
    content: message.content,
    sources: message.sources ?? undefined,
  })), [history.data]);
  const messages = useMemo(() => [...persistedMessages, ...(pending.sessionId === activeSessionId ? pending.items : [])], [activeSessionId, pending, persistedMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const handleCreateSession = async () => {
    setError(null);
    try {
      const session = await createSession.mutateAsync();
      setSelectedSessionId(session.id);
      setPending(EMPTY_PENDING);
      await utils.chat.listSessions.invalidate();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not create a new chat.");
    }
  };

  const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || isStreaming) return;
    setError(null);
    setIsStreaming(true);
    let sessionId: string | null = activeSessionId;
    try {
      if (!sessionId) sessionId = (await createSession.mutateAsync()).id;
      setSelectedSessionId(sessionId);
      setPending({ sessionId, items: [{ role: "USER", content: text }, { role: "ASSISTANT", content: "", sources: [] }] });
      const token = await getToken();
      const organizationId = String(user?.unsafeMetadata?.activeOrgId ?? "");
      if (!token || !organizationId) throw new Error("Your sign-in or workspace selection has expired. Refresh and try again.");

      setInput("");
      const response = await fetch("/api/chat/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}`, "x-org-id": organizationId },
        body: JSON.stringify({ sessionId, message: text }),
      });
      if (!response.ok) {
        const detail: unknown = await response.json().catch(() => null);
        throw new Error(isRecord(detail) && typeof detail.error === "string" ? detail.error : `Chat request failed (${response.status}).`);
      }
      if (!response.body) throw new Error("The server returned no response stream.");

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let streamError: string | null = null;
      const consume = (block: string) => {
        const parsed = parseSseBlock(block);
        if (!parsed) return;
        if (parsed.event === "token" && typeof parsed.data.text === "string") {
          const textPart = parsed.data.text;
          setPending((previous) => previous.sessionId === sessionId ? {
            ...previous,
            items: previous.items.map((message, index) => index === previous.items.length - 1 && message.role === "ASSISTANT"
              ? { ...message, content: message.content + textPart }
              : message),
          } : previous);
        } else if (parsed.event === "sources") {
          const citations = parseCitations(parsed.data.sources);
          setPending((previous) => previous.sessionId === sessionId ? {
            ...previous,
            items: previous.items.map((message, index) => index === previous.items.length - 1 && message.role === "ASSISTANT"
              ? { ...message, sources: citations }
              : message),
          } : previous);
        } else if (parsed.event === "error" && typeof parsed.data.message === "string") {
          streamError = parsed.data.message;
        }
      };

      while (true) {
        const { value, done } = await reader.read();
        buffer += decoder.decode(value, { stream: !done });
        const blocks = buffer.split(/\r?\n\r?\n/);
        buffer = blocks.pop() ?? "";
        for (const block of blocks) consume(block);
        if (done) break;
      }
      if (buffer.trim()) consume(buffer);
      if (streamError) throw new Error(streamError);

      await Promise.all([
        utils.chat.getHistory.fetch({ sessionId }),
        utils.chat.listSessions.invalidate(),
      ]);
      setPending(EMPTY_PENDING);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to send message.");
      if (sessionId) {
        const savedHistory = await utils.chat.getHistory.fetch({ sessionId }).catch(() => null);
        if (savedHistory) setPending(EMPTY_PENDING);
        else setPending((previous) => previous.sessionId === sessionId
          ? { ...previous, items: previous.items.filter((message) => message.role === "USER") }
          : previous);
      }
    } finally {
      setIsStreaming(false);
    }
  };

  return (
    <div className="flex h-full min-h-0 bg-slate-950">
      <aside className="hidden w-72 shrink-0 flex-col border-r border-slate-800 bg-slate-900/50 p-4 md:flex">
        <button onClick={() => void handleCreateSession()} disabled={createSession.isPending || isStreaming} className="mb-6 flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 p-3 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50"><Plus size={18} />New chat</button>
        <div className="flex-1 space-y-2 overflow-y-auto pr-2">{sessions.data?.map((session) => <button key={session.id} onClick={() => { setSelectedSessionId(session.id); setPending(EMPTY_PENDING); }} disabled={isStreaming} className={`flex w-full items-center gap-3 rounded-lg p-3 text-left text-sm transition disabled:opacity-50 ${activeSessionId === session.id ? "bg-slate-800 text-white" : "text-slate-400 hover:bg-slate-800/50 hover:text-slate-200"}`}><MessageSquare size={16} className="shrink-0" /><span className="truncate">{session.title}</span></button>)}</div>
        <Link href="/app/settings/sources" className="mt-4 text-sm text-slate-400 hover:text-white">Manage documents</Link>
      </aside>
      <section className="relative flex min-w-0 flex-1 flex-col">
        {error && <div role="alert" className="absolute left-4 right-4 top-4 z-10 flex items-center gap-2 rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-red-300"><AlertCircle size={18} />{error}</div>}
        <div className="flex-1 space-y-6 overflow-y-auto p-6">
          {!activeSessionId && messages.length === 0 && <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500"><MessageSquare size={48} /><p>Select a chat or start a new conversation.</p><button onClick={() => void handleCreateSession()} className="rounded-lg bg-blue-600 px-4 py-2 text-white">Start a chat</button></div>}
          {activeSessionId && history.isLoading && messages.length === 0 && <p className="text-sm text-slate-500">Loading conversation…</p>}
          {messages.map((message, index) => <div key={`${activeSessionId}-${index}`} className={`flex ${message.role === "USER" ? "justify-end" : "justify-start"}`}><div className={`max-w-[90%] rounded-2xl p-4 shadow-sm md:max-w-3xl ${message.role === "USER" ? "rounded-br-none bg-blue-600 text-white" : "rounded-bl-none border border-slate-700 bg-slate-800 text-slate-200"}`}><div className="whitespace-pre-wrap leading-relaxed">{message.content || (isStreaming ? "Searching documents…" : "")}</div>{message.sources && message.sources.length > 0 && <div className="mt-4 space-y-2 border-t border-slate-700 pt-3"><p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Retrieved evidence</p>{message.sources.map((source, sourceIndex) => <details key={`${source.documentId}-${source.chunkIndex}-${sourceIndex}`} className="rounded bg-slate-900 px-3 py-2"><summary className="cursor-pointer text-xs text-blue-300"><FileText size={13} className="mr-1 inline" />[{sourceIndex + 1}] {source.title} · passage {source.chunkIndex + 1}</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{source.excerpt ?? "Evidence excerpt is unavailable for this earlier citation."}</p></details>)}</div>}</div></div>)}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-800 bg-slate-900/80 p-5 backdrop-blur-sm"><form onSubmit={sendMessage} className="relative mx-auto flex max-w-4xl gap-3"><input value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question about your documents…" maxLength={4_000} className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-5 py-4 pr-14 text-white transition focus:border-blue-500 focus:outline-none" disabled={isStreaming} /><button type="submit" disabled={isStreaming || !input.trim()} aria-label="Send message" className="absolute bottom-2 right-2 top-2 flex items-center justify-center rounded-lg bg-blue-600 px-4 text-white transition hover:bg-blue-500 disabled:opacity-50"><Send size={18} /></button></form><p className="mx-auto mt-2 max-w-4xl text-xs text-slate-500">Answers use documents in your selected workspace. Check the linked sources for important details.</p></div>
      </section>
    </div>
  );
}
