'use client';
import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { ArrowLeft, FileText } from 'lucide-react';

export default function DocumentsPage() {
    const [docs, setDocs] = useState<any[]>([]);

    useEffect(() => {
        fetch('/api/lite/documents').then(r => r.json()).then(d => setDocs(d.docs));
    }, []);

    return (
        <div className="min-h-screen bg-slate-950 text-slate-100 p-8">
            <Link href="/" className="flex items-center gap-2 text-slate-400 hover:text-white mb-8 transition">
                <ArrowLeft size={16} /> Back
            </Link>
            <h1 className="text-3xl font-bold mb-8">In-Memory Documents</h1>
            
            <div className="grid gap-4 max-w-4xl">
                {docs.map(doc => (
                    <div key={doc.id} className="p-6 bg-slate-900 border border-slate-800 rounded-xl">
                        <div className="flex items-center gap-3 mb-4">
                            <FileText className="text-blue-500" />
                            <h2 className="text-xl font-bold">{doc.title}</h2>
                        </div>
                        <div className="bg-slate-950 p-4 rounded-lg font-mono text-sm text-slate-400 whitespace-pre-wrap">
                            {doc.content}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}