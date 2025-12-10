import { NextRequest, NextResponse } from 'next/server';
import { store } from '@/lib/liteStore';
import { OpenAI } from 'openai';

const apiKey = process.env.OPENAI_API_KEY;
const openai = apiKey ? new OpenAI({ apiKey }) : null;

export async function POST(req: NextRequest) {
    try {
        const { sessionId, message } = await req.json();

        if (!sessionId || !message) {
            return NextResponse.json({ error: 'Missing fields' }, { status: 400 });
        }

        let session = store.getSession(sessionId);
        if (!session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        store.addMessage(sessionId, 'user', message);

        const docs = store.getDocuments();
        const contextText = docs.map(d => `[Title: ${d.title}]\n${d.content}`).join('\n\n');

        const systemPrompt = `You are Lumina Lite. Answer using ONLY the context below.
        
        CONTEXT:
        ${contextText}`;

        let assistantReply = "";

        if (openai) {
            try {
                const completion = await openai.chat.completions.create({
                    model: "gpt-3.5-turbo",
                    messages: [
                        { role: "system", content: systemPrompt },
                        ...session.messages.map(m => ({ role: m.role, content: m.content }))
                    ],
                });
                assistantReply = completion.choices[0]?.message?.content || "No response generated.";
            } catch (e) {
                console.error("OpenAI Error", e);
                assistantReply = "Error contacting AI provider. Please check API key.";
            }
        } else {
            assistantReply = `(Lite Mode - No API Key)\n\nI found ${docs.length} documents in memory.\n\nSimulated Answer based on context: "${contextText.slice(0, 50)}..."`;
        }

        store.addMessage(sessionId, 'assistant', assistantReply);

        return NextResponse.json({ 
            response: assistantReply,
            history: session.messages 
        });

    } catch (e) {
        console.error(e);
        return NextResponse.json({ error: 'Internal Error' }, { status: 500 });
    }
}