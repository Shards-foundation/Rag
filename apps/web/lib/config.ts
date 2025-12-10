export const IS_LITE_MODE = true; 

export const INITIAL_DOCS = [
    { 
        id: 'doc-1', 
        title: 'Project Lumina Overview', 
        content: 'Lumina is an enterprise AI knowledge hub designed to unify internal data silos. It features RAG chat, document ingestion, and strict multi-tenant security.' 
    },
    {
        id: 'doc-2',
        title: 'Deployment Guide',
        content: 'To deploy Lumina, use pnpm run dev:all. Ensure Postgres and Redis are running. For Lite mode, simply run pnpm dev:web.'
    }
];