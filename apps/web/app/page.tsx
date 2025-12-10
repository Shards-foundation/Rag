import Link from 'next/link';

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-slate-950 text-white flex flex-col items-center justify-center p-4 relative overflow-hidden">
      <div className="z-10 text-center max-w-3xl">
        <div className="inline-block px-3 py-1 bg-blue-500/10 text-blue-400 rounded-full text-sm font-medium mb-6 border border-blue-500/20">
            Lumina Lite Mode Available
        </div>
        <h1 className="text-5xl md:text-7xl font-bold mb-6 tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-blue-400 to-purple-400">
          Lumina
        </h1>
        <p className="text-xl md:text-2xl text-slate-400 mb-10 leading-relaxed">
          The Enterprise AI Knowledge Hub. <br/>
          Chat with your PDFs, Slack, and Drive documents securely.
        </p>
        
        <div className="flex flex-col md:flex-row gap-4 justify-center items-center">
          <Link 
            href="/chat" 
            className="px-8 py-4 bg-blue-600 rounded-lg font-bold text-lg hover:bg-blue-500 transition shadow-lg shadow-blue-900/50"
          >
            Launch Lite Chat
          </Link>
          <Link 
            href="/app/chat" 
            className="px-8 py-4 bg-slate-800 rounded-lg font-medium text-lg text-slate-300 hover:bg-slate-700 transition"
          >
            Full App (Login)
          </Link>
        </div>
      </div>
      
      <div className="absolute bottom-8 text-slate-600 text-sm">
        System Status: {process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ? 'Online' : 'Preview Mode'}
      </div>
    </div>
  );
}