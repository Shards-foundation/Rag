# Lumina — private RAG for your documents

Lumina is a multi-workspace retrieval-augmented generation application. It supports authenticated Clerk users, organization-scoped PDF/TXT/Markdown ingestion, PostgreSQL-backed document chunks and embeddings, Redis/BullMQ indexing, OpenAI-based retrieval and answer generation, persistent chat history, and citations that remain visible after reload.

The repository also includes **Lite Mode** at `/chat`. Lite Mode is useful for evaluating file extraction and retrieval without configuring the backend services. It keeps each browser visitor's sessions and documents separate, but stores them in process memory: data is lost on a server restart and does not replicate across multiple web instances. It is not for sensitive documents or durable production use.

## Requirements

- Node.js 22 (Node 20.16+ is required by the current PDF parser dependency)
- npm 10+
- Docker Compose for local PostgreSQL 16 and Redis 7, or equivalent services
- A Clerk application for full-workspace authentication
- An OpenAI API key for embeddings and generated answers; Lite Mode can still search retrieved passages without one

## Run locally

```bash
cp .env.example .env
# Edit .env and set Clerk/OpenAI credentials for the full workspace.
docker compose up -d postgres redis
npm ci
npm run db:init
npm run dev:all
```

Open `http://localhost:3000`. The API listens on port 3001. `npm run dev:all` builds shared workspace packages before starting the web app, API, and worker. Lite Mode is available at `/chat` without Clerk, PostgreSQL, or Redis; PDF extraction runs in the Node.js web server. For full mode, Clerk's allowed origin and `WEB_URL` must exactly match the browser origin.

The API and worker must use the same `UPLOAD_DIR` and have read/write access to it. The default is the repository's `storage/uploads` directory. In a multi-container deployment, mount a shared persistent volume at that same path. Keep `.env` outside source control and use a separate strong PostgreSQL password and TLS-protected services outside local development.

## Full-app workflow

1. Sign in through Clerk and create a workspace. Workspace membership is stored in PostgreSQL; the active organization header is checked against that membership on every tenant-scoped API operation.
2. Open **Documents** and upload a text-based PDF, TXT, or Markdown file up to 10 MB. The API validates the file, stores it, and queues indexing in Redis. The worker extracts text, chunks it, obtains embeddings, and atomically replaces that document's persisted chunks.
3. Ask a question in **Chat**. The API verifies the Clerk bearer token, checks the user, workspace membership, and session ownership, retrieves top passages for that workspace only, streams the generated answer, and saves the answer together with source metadata.

Scanned/image-only PDFs and OCR are not supported. Drive and Slack connectors are not enabled in this release. Chat answers require configured OpenAI access; do not treat model output as a substitute for reviewing the cited source documents.

## Environment

See [.env.example](.env.example) for all variable names and local defaults. `DATABASE_URL`, `REDIS_URL`, `API_PORT`, `WEB_URL`, and `UPLOAD_DIR` are used by the backend. `API_URL` configures the Next.js server-side proxy target. `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is public by design; `CLERK_SECRET_KEY` and `OPENAI_API_KEY` are secrets and must never be committed.

## Checks

```bash
npm run lint
npm test
npm run build
npm audit --audit-level=high
```

The unit tests cover chunking, retrieval ranking, and Lite Mode visitor isolation. The full end-to-end flow requires live Clerk and OpenAI credentials plus running PostgreSQL and Redis services.
