'use client';

import React, { useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { ArrowLeft, FileText, Loader2, UploadCloud } from "lucide-react";

type LiteDocument = { id: string; title: string; content: string; size: number; createdAt: string };
type DocumentResponse = { docs: LiteDocument[]; error?: string };
const MAX_BYTES = 10 * 1024 * 1024;
const documentKey = ["lite", "documents"] as const;

export default function DocumentsPage() {
  const queryClient = useQueryClient();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const documentsQuery = useQuery({
    queryKey: documentKey,
    queryFn: async () => {
      const response = await fetch("/api/lite/documents", { cache: "no-store" });
      const data = await response.json() as DocumentResponse;
      if (!response.ok) throw new Error(data.error ?? "Could not load documents.");
      return data;
    },
  });
  const docs = documentsQuery.data?.docs ?? [];

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setError(null);
    if (file.size === 0 || file.size > MAX_BYTES) { setError("Choose a non-empty file no larger than 10 MB."); event.target.value = ""; return; }
    if (!/\.(pdf|txt|md)$/i.test(file.name)) { setError("Only PDF, TXT, and Markdown files are supported."); event.target.value = ""; return; }
    const reader = new FileReader();
    reader.onerror = () => setError("Could not read this file.");
    reader.onload = async () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const contentBase64 = result.slice(result.indexOf(",") + 1);
      if (!contentBase64) { setError("Could not read file contents."); return; }
      setBusy(true);
      try {
        const response = await fetch("/api/lite/documents", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ fileName: file.name, contentBase64 }) });
        const data = await response.json() as { error?: string };
        if (!response.ok) throw new Error(data.error ?? "Upload failed.");
        await queryClient.invalidateQueries({ queryKey: documentKey });
      } catch (cause) { setError(cause instanceof Error ? cause.message : "Upload failed."); }
      finally { setBusy(false); if (inputRef.current) inputRef.current.value = ""; }
    };
    reader.readAsDataURL(file);
  };

  return (
    <main className="min-h-screen bg-slate-950 p-6 text-slate-100 md:p-10">
      <div className="mx-auto max-w-4xl">
        <Link href="/chat" className="mb-8 inline-flex items-center gap-2 text-slate-400 transition hover:text-white"><ArrowLeft size={16} />Back to Lite Chat</Link>
        <header className="mb-8"><h1 className="text-3xl font-bold">Lite Mode documents</h1><p className="mt-2 text-slate-400">Upload PDF, TXT, or Markdown files. PDF text is extracted on the server; scans without a text layer are not supported.</p></header>
        <div className="mb-8 rounded-xl border border-slate-800 bg-slate-900 p-6"><input ref={inputRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={handleFile} className="sr-only" /><button onClick={() => inputRef.current?.click()} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-medium hover:bg-blue-500 disabled:opacity-50">{busy ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}{busy ? "Extracting text…" : "Choose a document"}</button><span className="ml-3 text-sm text-slate-500">10 MB maximum per file</span>{(error || documentsQuery.error instanceof Error) && <p role="alert" className="mt-4 text-sm text-red-400">{error ?? documentsQuery.error?.message}</p>}</div>
        <section className="space-y-4"><h2 className="text-xl font-semibold">Your demo documents ({docs.length})</h2>{documentsQuery.isLoading && <p className="text-sm text-slate-500">Loading documents…</p>}{docs.length === 0 && !documentsQuery.isLoading && <p className="rounded-xl border border-dashed border-slate-700 p-8 text-center text-slate-500">No documents yet. Add one above, then ask questions in Lite Chat.</p>}{docs.map((document) => <article key={document.id} className="rounded-xl border border-slate-800 bg-slate-900 p-5"><div className="mb-3 flex items-center gap-3"><FileText className="text-blue-400" size={20} /><div className="min-w-0 flex-1"><h3 className="truncate font-semibold">{document.title}</h3><p className="text-xs text-slate-500">{(document.size / 1024).toFixed(0)} KB · {new Date(document.createdAt).toLocaleString()}</p></div></div><p className="whitespace-pre-wrap break-words text-sm text-slate-400">{document.content.slice(0, 1_500)}{document.content.length > 1_500 ? "…" : ""}</p></article>)}</section>
      </div>
    </main>
  );
}
