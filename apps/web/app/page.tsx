import Link from "next/link";

export default function LandingPage() {
  const fullModeConfigured = Boolean(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY);
  return (
    <main className="relative flex min-h-screen flex-col items-center justify-center overflow-hidden bg-slate-950 p-6 text-white">
      <div className="z-10 max-w-3xl text-center">
        <div className="mb-6 inline-block rounded-full border border-blue-500/20 bg-blue-500/10 px-3 py-1 text-sm font-medium text-blue-300">Private retrieval-augmented generation</div>
        <h1 className="mb-6 bg-gradient-to-r from-blue-400 to-purple-400 bg-clip-text text-5xl font-bold tracking-tight text-transparent md:text-7xl">Lumina</h1>
        <p className="mb-10 text-xl leading-relaxed text-slate-300 md:text-2xl">Ask questions about documents in your workspace. Every full-app answer is grounded in retrieved passages and links back to its sources.</p>
        <div className="flex flex-col items-center justify-center gap-4 sm:flex-row">
          <Link href="/app/chat" className="rounded-lg bg-blue-600 px-8 py-4 text-lg font-bold shadow-lg shadow-blue-900/40 transition hover:bg-blue-500">Open full workspace</Link>
          <Link href="/chat" className="rounded-lg bg-slate-800 px-8 py-4 text-lg font-medium text-slate-200 transition hover:bg-slate-700">Try Lite Mode</Link>
        </div>
        <p className="mt-6 text-sm text-slate-500">{fullModeConfigured ? "Full workspace is configured for sign-in." : "Full workspace requires Clerk, PostgreSQL, Redis, and an OpenAI API key."}</p>
      </div>
      <div className="absolute bottom-6 max-w-xl text-center text-xs text-slate-600">Lite Mode uses temporary in-memory data for evaluation; it is not a durable or multi-instance production store. Workspace data is handled by your configured services.</div>
    </main>
  );
}
