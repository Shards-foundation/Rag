'use client';
import { trpc } from "../../../../lib/trpc";
import React, { useState, useEffect, useRef } from "react";
import { useUser } from "@clerk/nextjs";
import { Send, Plus, MessageSquare, AlertCircle } from "lucide-react";

interface Message {
    role: 'USER' | 'ASSISTANT';
    content: string;
}

export default function ChatPage() {
    const { user } = useUser();
    const [currentSessionId, setCurrentSessionId] = useState<string | null>(null);
    const [messages, setMessages] = useState<Message[]>([]);
    const [input, setInput] = useState("");
    const [isStreaming, setIsStreaming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const bottomRef = useRef<HTMLDivElement>(null);

    const sessions = trpc.chat.listSessions.useQuery();
    const createSession = trpc.chat.createSession.useMutation();
    const history = trpc.chat.getHistory.useQuery(
        { sessionId: currentSessionId! }, 
        { enabled: !!currentSessionId }
    );

    useEffect(() => {
        if (history.data) {
            setMessages(history.data.map((m: any) => ({ role: m.role, content: m.content })));
        }
    }, [history.data]);

    useEffect(() => {
        bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    const handleCreateSession = async () => {
        setError(null);
        try {
            const s = await createSession.mutateAsync();
            sessions.refetch();
            setCurrentSessionId(s.id);
            setMessages([]);
        } catch (e) {
            setError("Failed to create chat session");
        }
    }

    const sendMessage = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!input.trim() || isStreaming) return;
        setError(null);
        
        let activeId = currentSessionId;
        try {
            if (!activeId) {
                const s = await createSession.mutateAsync();
                setCurrentSessionId(s.id);
                activeId = s.id;
                sessions.refetch();
            }

            const userMsg = input;
            setInput("");
            setMessages(prev => [...prev, { role: 'USER', content: userMsg }]);
            setIsStreaming(true);

            const res = await fetch('/api/chat/stream', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    sessionId: activeId,
                    message: userMsg,
                    userId: user?.id,
                    organizationId: user?.unsafeMetadata?.activeOrgId
                })
            });

            if (!res.ok) {
                const errData = await res.json().catch(() => ({}));
                throw new Error(errData?.error?.message || "Server error");
            }

            if (!res.body) throw new Error("No response body");
            
            setMessages(prev => [...prev, { role: 'ASSISTANT', content: "" }]);

            const reader = res.body.getReader();
            const decoder = new TextDecoder();
            let done = false;

            while (!done) {
                const { value, done: doneReading } = await reader.read();
                done = doneReading;
                const chunkValue = decoder.decode(value);
                
                setMessages(prev => {
                    const newArr = [...prev];
                    const last = newArr[newArr.length - 1];
                    last.content += chunkValue;
                    return newArr;
                });
            }

        } catch (e: any) {
            console.error(e);
            setError(e.message || "Failed to send message");
            setMessages(prev => {
                const last = prev[prev.length - 1];
                if (last?.role === 'ASSISTANT' && last.content === "") {
                    return prev.slice(0, -1);
                }
                return prev;
            });
        } finally {
            setIsStreaming(false);
            if (activeId) {
                setTimeout(() => { history.refetch(); }, 1000);
            }
        }
    };

    return (
        <div className="flex h-full bg-slate-950">
            <div className="w-72 border-r border-slate-800 bg-slate-900/50 p-4 flex flex-col hidden md:flex">
                <button 
                    onClick={handleCreateSession} 
                    className="w-full bg-blue-600 text-white p-3 rounded-lg mb-6 hover:bg-blue-500 transition flex items-center justify-center gap-2 font-medium"
                >
                    <Plus size={18} /> New Chat
                </button>
                <div className="flex-1 overflow-y-auto space-y-2 pr-2">
                    {sessions.data?.map((s: any) => (
                        <button 
                            key={s.id} 
                            onClick={() => setCurrentSessionId(s.id)}
                            className={`w-full text-left p-3 rounded-lg text-sm flex items-center gap-3 transition ${currentSessionId === s.id ? 'bg-slate-800 text-white' : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/50'}`}
                        >
                            <MessageSquare size={16} className="shrink-0" />
                            <span className="truncate">{s.title}</span>
                        </button>
                    ))}
                </div>
            </div>

            <div className="flex-1 flex flex-col relative">
                {error && (
                    <div className="absolute top-4 left-4 right-4 z-10 bg-red-500/10 border border-red-500/20 text-red-400 p-3 rounded-lg flex items-center gap-2">
                        <AlertCircle size={18} />
                        {error}
                    </div>
                )}
                
                <div className="flex-1 overflow-y-auto p-6 space-y-6">
                    {!currentSessionId && messages.length === 0 && (
                        <div className="h-full flex flex-col items-center justify-center text-slate-500 gap-4 opacity-50">
                            <MessageSquare size={48} />
                            <p>Select a chat or start a new conversation.</p>
                        </div>
                    )}
                    {messages.map((m, i) => (
                        <div key={i} className={`flex ${m.role === 'USER' ? 'justify-end' : 'justify-start'}`}>
                            <div className={`max-w-[85%] md:max-w-3xl p-4 rounded-2xl shadow-sm ${
                                m.role === 'USER' 
                                ? 'bg-blue-600 text-white rounded-br-none' 
                                : 'bg-slate-800 text-slate-200 rounded-bl-none border border-slate-700'
                            }`}>
                                <div className="whitespace-pre-wrap leading-relaxed">{m.content}</div>
                            </div>
                        </div>
                    ))}
                    {isStreaming && messages[messages.length-1]?.role === 'USER' && (
                        <div className="flex justify-start">
                             <div className="bg-slate-800 p-4 rounded-2xl rounded-bl-none border border-slate-700 text-slate-400 text-sm animate-pulse">
                                 Lumina is thinking...
                             </div>
                        </div>
                    )}
                    <div ref={bottomRef} />
                </div>
                
                <div className="p-6 border-t border-slate-800 bg-slate-900/80 backdrop-blur-sm">
                    <form onSubmit={sendMessage} className="flex gap-4 max-w-4xl mx-auto relative">
                        <input 
                            value={input}
                            onChange={e => setInput(e.target.value)}
                            placeholder="Ask a question about your documents..."
                            className="flex-1 bg-slate-950 text-white px-6 py-4 rounded-xl border border-slate-800 focus:outline-none focus:border-blue-500 transition"
                            disabled={isStreaming}
                        />
                        <button 
                            disabled={isStreaming || !input.trim()} 
                            className="absolute right-2 top-2 bottom-2 bg-blue-600 px-4 rounded-lg text-white disabled:opacity-50 hover:bg-blue-500 transition flex items-center justify-center"
                        >
                            <Send size={18} />
                        </button>
                    </form>
                </div>
            </div>
        </div>
    );
}