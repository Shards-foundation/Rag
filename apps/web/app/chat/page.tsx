'use client';
import React, { useState, useEffect, useRef } from 'react';
import { Send, Plus, MessageSquare } from 'lucide-react';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

interface Session {
    id: string;
    title: string;
}

export default function LiteChatPage() {
  const [sessions, setSessions] = useState<Session[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Initial Load
  useEffect(() => {
      fetch('/api/lite/init').then(res => res.json()).then(data => {
          setSessions(data.sessions);
          if (data.sessions.length > 0) {
              setActiveSessionId(data.sessions[0].id);
              fetch(`/api/lite/session?id=${data.sessions[0].id}`).then(r=>r.json()).then(d => setMessages(d.messages));
          }
      });
  }, []);

  useEffect(() => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const createSession = async () => {
      const res = await fetch('/api/lite/init', { method: 'POST' });
      const data = await res.json();
      setSessions(prev => [data.session, ...prev]);
      setActiveSessionId(data.session.id);
      setMessages([]);
  };

  const loadSession = async (id: string) => {
      setActiveSessionId(id);
      const res = await fetch(`/api/lite/session?id=${id}`);
      const data = await res.json();
      setMessages(data.messages);
  };

  const sendMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || loading) return;

    let currentId = activeSessionId;
    if (!currentId) {
        const res = await fetch('/api/lite/init', { method: 'POST' });
        const data = await res.json();
        setSessions(prev => [data.session, ...prev]);
        setActiveSessionId(data.session.id);
        currentId = data.session.id;
    }

    const userMsg = input;
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: currentId, message: userMsg }),
      });
      const data = await res.json();
      setMessages(data.history); 
    } catch (err) {
      console.error(err);
      setMessages(prev => [...prev, { role: 'assistant', content: "Error: Could not reach Lite API." }]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex h-screen bg-slate-950 text-slate-100">
      <div className="w-64 border-r border-slate-800 p-4 bg-slate-900/50 flex flex-col">
        <div className="font-bold text-xl mb-6 px-2 flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-green-500"></div> Lumina Lite
        </div>
        <button onClick={createSession} className="w-full bg-blue-600 p-2 rounded mb-4 flex items-center justify-center gap-2 text-sm font-bold hover:bg-blue-500 transition">
            <Plus size={16}/> New Chat
        </button>
        <div className="flex-1 overflow-y-auto space-y-1">
            {sessions.map(s => (
                <button 
                    key={s.id} 
                    onClick={() => loadSession(s.id)}
                    className={`w-full text-left p-2 rounded text-sm truncate transition ${activeSessionId === s.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200'}`}
                >
                    {s.title}
                </button>
            ))}
        </div>
      </div>

      <div className="flex-1 flex flex-col">
        <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {messages.length === 0 && (
                <div className="h-full flex items-center justify-center text-slate-500 flex-col gap-2">
                    <MessageSquare size={32} opacity={0.5}/>
                    <p>Lite Mode Ready. Ask a question.</p>
                </div>
            )}
            {messages.map((m, i) => (
                <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                    <div className={`max-w-2xl p-4 rounded-2xl ${m.role === 'user' ? 'bg-blue-600 text-white rounded-br-none' : 'bg-slate-800 text-slate-200 rounded-bl-none'}`}>
                        <div className="whitespace-pre-wrap">{m.content}</div>
                    </div>
                </div>
            ))}
            {loading && (
                <div className="flex justify-start">
                    <div className="bg-slate-800 p-4 rounded-2xl rounded-bl-none text-slate-400 text-sm animate-pulse">
                        Thinking...
                    </div>
                </div>
            )}
            <div ref={bottomRef} />
        </div>
        <div className="p-4 border-t border-slate-800 bg-slate-900">
             <form onSubmit={sendMessage} className="flex gap-2 max-w-4xl mx-auto">
                <input 
                    value={input}
                    onChange={e => setInput(e.target.value)}
                    placeholder="Message Lumina Lite..."
                    className="flex-1 bg-slate-950 border border-slate-800 px-4 py-3 rounded-xl focus:outline-none focus:border-blue-500 transition"
                    disabled={loading}
                />
                <button disabled={loading} className="bg-blue-600 px-4 rounded-xl hover:bg-blue-500 transition disabled:opacity-50">
                    <Send size={18} />
                </button>
             </form>
        </div>
      </div>
    </div>
  );
}