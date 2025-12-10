import { INITIAL_DOCS } from './config';

interface LiteDocument {
    id: string;
    title: string;
    content: string;
    createdAt: Date;
}

interface LiteMessage {
    role: 'user' | 'assistant';
    content: string;
}

interface LiteSession {
    id: string;
    title: string;
    messages: LiteMessage[];
    updatedAt: Date;
}

const globalStore = globalThis as unknown as {
    docs: LiteDocument[];
    sessions: LiteSession[];
};

if (!globalStore.docs) {
    globalStore.docs = [...INITIAL_DOCS.map(d => ({ ...d, createdAt: new Date() }))];
    globalStore.sessions = [];
}

export const store = {
    getDocuments: () => globalStore.docs,
    
    addDocument: (title: string, content: string) => {
        const doc = {
            id: `doc-${Date.now()}`,
            title,
            content,
            createdAt: new Date()
        };
        globalStore.docs.unshift(doc);
        return doc;
    },

    getSessions: () => globalStore.sessions.sort((a, b) => b.updatedAt.getTime() - a.updatedAt.getTime()),

    createSession: () => {
        const session = {
            id: `sess-${Date.now()}`,
            title: 'New Chat',
            messages: [],
            updatedAt: new Date()
        };
        globalStore.sessions.push(session);
        return session;
    },

    getSession: (id: string) => globalStore.sessions.find(s => s.id === id),

    addMessage: (sessionId: string, role: 'user' | 'assistant', content: string) => {
        const session = globalStore.sessions.find(s => s.id === sessionId);
        if (session) {
            session.messages.push({ role, content });
            session.updatedAt = new Date();
            if (session.messages.length === 1 && role === 'user') {
                session.title = content.slice(0, 30) + (content.length > 30 ? '...' : '');
            }
        }
    }
};