'use client';

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { FileText, MessageSquare, Plus, Send } from "lucide-react";

type Citation = { documentId: string; title: string; chunkIndex: number; score: number; excerpt?: string };
type ChatMessage = { role: "user" | "assistant"; content: string; sources?: Citation[] };
type Session = { id: string; title: string };
type InitResponse = { sessions: Session[]; error?: string };
type HistoryResponse = { messages: ChatMessage[]; error?: string };

const initKey = ["lite", "init"] as const;
const historyKey = (sessionId: string) => ["lite", "session", sessionId] as const;

async function readJson<T extends { error?: string }>(response: Response): Promise<T> {
  const data = await response.json() as T;
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

export default function LiteChatPage() {
  const queryClient = useQueryClient();
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<{ sessionId: string | null; items: ChatMessage[] }>({ sessionId: null, items: [] });
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const sessionsQuery = useQuery({
    queryKey: initKey,
    queryFn: async () => readJson<InitResponse>(await fetch("/api/lite/init", { cache: "no-store" })),
  });
  const sessions = sessionsQuery.data?.sessions ?? [];
  const activeSessionId = selectedSessionId ?? sessions[0]?.id ?? null;
  const historyQuery = useQuery({
    queryKey: activeSessionId ? historyKey(activeSessionId) : ["lite", "session", "none"],
    enabled: Boolean(activeSessionId && sessionsQuery.isSuccess),
    queryFn: async () => readJson<HistoryResponse>(await fetch(`/api/lite/session?id=${encodeURIComponent(activeSessionId!)}`, { cache: "no-store" })),
  });
  const messages = useMemo(() => [
    ...(historyQuery.data?.messages ?? []),
    ...(pendingMessages.sessionId === activeSessionId ? pendingMessages.items : []),
  ], [activeSessionId, historyQuery.data, pendingMessages]);

  useEffect(() => { bottomRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  const createSession = async (): Promise<Session> => {
    const data = await readJson<{ session: Session; error?: string }>(await fetch("/api/lite/init", { method: "POST" }));
    queryClient.setQueryData<InitResponse>(initKey, (previous) => ({
      sessions: [data.session, ...(previous?.sessions ?? []).filter((session) => session.id !== data.session.id)],
    }));
    setSelectedSessionId(data.session.id);
    setPendingMessages({ sessionId: null, items: [] });
    return data.session;
  };

  const loadSession = (id: string) => {
    setSelectedSessionId(id);
    setPendingMessages({ sessionId: null, items: [] });
    setError(null);
  };

  const sendMessage = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const text = input.trim();
    if (!text || loading) return;
    setError(null);
    setLoading(true);
    let sessionId = activeSessionId;
    try {
      if (!sessionId) sessionId = (await createSession()).id;
      setPendingMessages({ sessionId, items: [{ role: "user", content: text }] });
      setInput("");
      const data = await readJson<{ history: ChatMessage[]; error?: string }>(await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, message: text }),
      }));
      queryClient.setQueryData<HistoryResponse>(historyKey(sessionId), { messages: data.history });
      queryClient.setQueryData<InitResponse>(initKey, (previous) => ({
        sessions: (previous?.sessions ?? []).map((session) => session.id === sessionId
          ? { ...session, title: text.slice(0, 60) }
          : session),
      }));
      setPendingMessages({ sessionId: null, items: [] });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Could not reach Lite Mode.");
      if (sessionId) void queryClient.invalidateQueries({ queryKey: historyKey(sessionId) });
    } finally {
      setLoading(false);
    }
  };

  const displayedError = error ?? (sessionsQuery.error instanceof Error ? sessionsQuery.error.message : null) ?? (historyQuery.error instanceof Error ? historyQuery.error.message : null);

  return (
    <main className="flex h-screen bg-slate-950 text-slate-100">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-800 bg-slate-900/50 p-4">
        <div className="mb-6 flex items-center gap-2 px-2 text-xl font-bold"><span className="h-3 w-3 rounded-full bg-green-500" />Lumina Lite</div>
        <button onClick={() => void createSession().catch((cause) => setError(cause instanceof Error ? cause.message : "Could not create a session."))} className="mb-4 flex items-center justify-center gap-2 rounded bg-blue-600 p-2 text-sm font-bold transition hover:bg-blue-500"><Plus size={16} />New chat</button>
        <div className="flex-1 space-y-1 overflow-y-auto">{sessions.map((session) => <button key={session.id} onClick={() => loadSession(session.id)} className={`w-full truncate rounded p-2 text-left text-sm transition ${activeSessionId === session.id ? "bg-slate-800 text-white" : "text-slate-400 hover:text-slate-200"}`}>{session.title}</button>)}</div>
        <Link href="/documents" className="mt-4 rounded px-2 py-2 text-sm text-blue-300 hover:bg-slate-800"><FileText className="mr-2 inline" size={15} />Manage demo documents</Link>
        <Link href="/" className="mt-2 px-2 text-xs text-slate-500 hover:text-white">Back to home</Link>
      </aside>
      <section className="flex min-w-0 flex-1 flex-col">
        <div className="border-b border-slate-800 bg-amber-500/5 px-5 py-2 text-xs text-amber-200">Lite Mode is in-memory. Data is visitor-isolated, resets when the server restarts, and is not suitable for sensitive or durable records.</div>
        <div className="flex-1 space-y-5 overflow-y-auto p-5">
          {displayedError && <div role="alert" className="rounded-lg border border-red-500/20 bg-red-500/10 p-3 text-sm text-red-300">{displayedError}</div>}
          {messages.length === 0 && <div className="flex h-full flex-col items-center justify-center gap-3 text-slate-500"><MessageSquare size={36} /><p>Upload a document, then ask a question about it.</p><Link href="/documents" className="rounded bg-slate-800 px-4 py-2 text-sm text-white">Add a document</Link></div>}
          {messages.map((message, index) => <div key={`${activeSessionId}-${index}`} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}><div className={`max-w-3xl rounded-2xl p-4 ${message.role === "user" ? "rounded-br-none bg-blue-600 text-white" : "rounded-bl-none bg-slate-800 text-slate-200"}`}><div className="whitespace-pre-wrap">{message.content}</div>{message.sources?.length ? <div className="mt-3 space-y-2 border-t border-slate-700 pt-3"><p className="text-xs uppercase text-slate-400">Retrieved evidence</p>{message.sources.map((source, sourceIndex) => <details key={`${source.documentId}-${source.chunkIndex}`} className="rounded bg-slate-900 px-3 py-2"><summary className="cursor-pointer text-xs text-blue-200"><FileText size={13} className="mr-1 inline" />[{sourceIndex + 1}] {source.title} · passage {source.chunkIndex + 1}</summary><p className="mt-2 whitespace-pre-wrap text-xs leading-relaxed text-slate-300">{source.excerpt ?? "Evidence excerpt unavailable."}</p></details>)}</div> : null}</div></div>)}
          {loading && <p className="text-sm text-slate-400">Searching your documents…</p>}
          <div ref={bottomRef} />
        </div>
        <div className="border-t border-slate-800 bg-slate-900 p-4"><form onSubmit={sendMessage} className="mx-auto flex max-w-4xl gap-2"><input value={input} onChange={(event) => setInput(event.target.value)} maxLength={4_000} placeholder="Ask a question about your Lite documents…" className="flex-1 rounded-xl border border-slate-800 bg-slate-950 px-4 py-3 focus:border-blue-500 focus:outline-none" disabled={loading} /><button type="submit" disabled={loading || !input.trim()} aria-label="Send message" className="rounded-xl bg-blue-600 px-4 transition hover:bg-blue-500 disabled:opacity-50"><Send size={18} /></button></form></div>
      </section>
    </main>
  );
}
