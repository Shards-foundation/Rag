'use client';

import React, { useRef, useState } from "react";
import { trpc } from "../../../../lib/trpc";
import { AlertCircle, CheckCircle, FileText, Loader2, UploadCloud } from "lucide-react";

const MAX_FILE_SIZE = 10 * 1024 * 1024;

export default function SourcesPage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const utils = trpc.useUtils();
  const sources = trpc.sources.list.useQuery();
  const documents = trpc.sources.listDocuments.useQuery(undefined, { refetchInterval: 3_000 });
  const upload = trpc.sources.upload.useMutation({
    onSuccess: async () => {
      setUploadError(null);
      await Promise.all([utils.sources.list.invalidate(), utils.sources.listDocuments.invalidate()]);
    },
    onError: (error) => setUploadError(error.message),
  });

  const handleFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    setUploadError(null);
    if (file.size === 0 || file.size > MAX_FILE_SIZE) {
      setUploadError("Choose a non-empty file no larger than 10 MB."); event.target.value = ""; return;
    }
    if (!/\.(txt|md|pdf)$/i.test(file.name)) {
      setUploadError("Only PDF, TXT, and MD files can be indexed."); event.target.value = ""; return;
    }
    const reader = new FileReader();
    reader.onerror = () => setUploadError("Could not read this file. Try again.");
    reader.onload = () => {
      const dataUrl = typeof reader.result === "string" ? reader.result : "";
      const contentBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
      if (!contentBase64) { setUploadError("Could not read file contents."); return; }
      upload.mutate({ fileName: file.name, contentBase64 });
      if (inputRef.current) inputRef.current.value = "";
    };
    reader.readAsDataURL(file);
  };

  return (
    <div className="mx-auto w-full max-w-6xl space-y-8 p-6 md:p-8">
      <header><h1 className="text-3xl font-bold">Knowledge sources</h1><p className="mt-2 text-slate-400">Upload documents to your selected workspace. Text is extracted, embedded, and made available to chat after indexing completes.</p></header>
      <section className="grid gap-5 md:grid-cols-3">
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6 md:col-span-2"><div className="mb-4 flex items-center gap-3"><span className="rounded-lg bg-blue-500/10 p-2 text-blue-400"><UploadCloud size={23} /></span><div><h2 className="text-lg font-semibold">Upload documents</h2><p className="text-sm text-slate-400">PDF, TXT, or Markdown · up to 10 MB each</p></div></div><input ref={inputRef} type="file" accept=".pdf,.txt,.md,application/pdf,text/plain,text/markdown" onChange={handleFile} className="sr-only" /><button type="button" onClick={() => inputRef.current?.click()} disabled={upload.isPending} className="rounded-lg bg-blue-600 px-5 py-3 font-medium text-white transition hover:bg-blue-500 disabled:opacity-50">{upload.isPending ? "Uploading…" : "Choose a file"}</button>{upload.isPending && <span className="ml-3 text-sm text-slate-400">Saving and queueing for indexing…</span>}{uploadError && <p role="alert" className="mt-4 flex items-center gap-2 text-sm text-red-400"><AlertCircle size={16} />{uploadError}</p>}<p className="mt-4 text-xs text-slate-500">Files are private to this workspace. Drive and Slack integrations are not enabled in this release.</p></div>
        <div className="rounded-xl border border-slate-800 bg-slate-900 p-6"><h2 className="font-semibold">Indexing status</h2><p className="mt-2 text-sm text-slate-400">New uploads appear as pending and update automatically as the worker extracts text and builds the search index.</p><p className="mt-4 text-xs text-slate-500">Keep the API, worker, PostgreSQL, and Redis services running while files are processed.</p></div>
      </section>
      <div className="grid gap-8 lg:grid-cols-2">
        <section className="space-y-3"><div className="flex items-center justify-between"><h2 className="text-xl font-bold">Connected sources</h2>{sources.isFetching && <span className="text-xs text-slate-500">Refreshing…</span>}</div><div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><table className="w-full text-left"><thead className="bg-slate-800/50 text-xs uppercase text-slate-400"><tr><th className="p-4">Name</th><th className="p-4">Status</th><th className="p-4 text-right">Documents</th></tr></thead><tbody className="divide-y divide-slate-800">{sources.data?.map((source) => <tr key={source.id}><td className="p-4 font-medium">{source.displayName}</td><td className="p-4 text-sm">{source.status}</td><td className="p-4 text-right font-mono">{source._count.documents}</td></tr>)}{sources.data?.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-sm text-slate-500">No sources yet.</td></tr>}{sources.isError && <tr><td colSpan={3} className="p-6 text-center text-sm text-red-400">{sources.error.message}</td></tr>}</tbody></table></div></section>
        <section className="space-y-3"><h2 className="text-xl font-bold">Recent documents</h2><div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900"><table className="w-full text-left"><thead className="bg-slate-800/50 text-xs uppercase text-slate-400"><tr><th className="p-4">Document</th><th className="p-4">Added</th><th className="p-4 text-right">Status</th></tr></thead><tbody className="divide-y divide-slate-800">{documents.data?.map((document) => <tr key={document.id}><td className="max-w-[190px] p-4"><div className="flex items-center gap-3"><FileText size={17} className="shrink-0 text-slate-400" /><span className="truncate" title={document.title}>{document.title}</span></div><p className="ml-7 mt-1 text-xs text-slate-500">{document.size ? `${(document.size / 1024).toFixed(0)} KB` : ""}</p></td><td className="p-4 text-sm text-slate-400">{new Date(document.createdAt).toLocaleDateString()}</td><td className="p-4 text-right">{document.status === "ACTIVE" ? <span className="inline-flex items-center gap-1 text-xs text-green-400"><CheckCircle size={15} />Ready</span> : document.status === "INDEXING" || document.status === "PENDING" ? <span className="inline-flex items-center gap-1 text-xs text-blue-300"><Loader2 size={15} className="animate-spin" />{document.status === "PENDING" ? "Queued" : "Indexing"}</span> : <span title="Could not extract or index this document" className="inline-flex items-center gap-1 text-xs text-red-400"><AlertCircle size={15} />Failed</span>}</td></tr>)}{documents.data?.length === 0 && <tr><td colSpan={3} className="p-6 text-center text-sm text-slate-500">Upload a document to build your knowledge base.</td></tr>}{documents.isError && <tr><td colSpan={3} className="p-6 text-center text-sm text-red-400">{documents.error.message}</td></tr>}</tbody></table></div></section>
      </div>
    </div>
  );
}
