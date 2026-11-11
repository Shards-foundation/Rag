# Shards RAG — document-grounded AI workspace

**Status: engineering preview, not production approved.** The internal monorepo package names still use `lumina`/`@lumina/*`. This branch is an unmerged draft until security, provider verification, and operational acceptance gates close.

Lumina is a multi-workspace retrieval-augmented generation application. It supports authenticated Clerk users, organization-scoped PDF/TXT/Markdown ingestion, PostgreSQL-backed document chunks and embeddings, Redis/BullMQ indexing, OpenAI-based retrieval and answer generation, persistent chat history, and citations that remain visible after reload.

The repository also includes **Lite Mode** at `/chat`. Lite Mode is useful for evaluating file extraction and retrieval without configuring the backend services. It keeps each browser visitor's sessions and documents separate, but stores them in process memory: data is lost on a server restart and does not replicate across multiple web instances. It is not for sensitive documents or durable production use. Lite Mode is **disabled by default in production** unless `LITE_MODE_ENABLED=true` is explicitly set behind trusted edge abuse controls. Lite Mode AI synthesis is **disabled by default** even when an OpenAI key is configured; explicitly set `LITE_MODE_AI_ENABLED=true` to opt in, and do so only behind trusted rate limits and abuse protection. At shared visitor capacity it refuses new visitors rather than deleting active visitors' data.

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

The bundled Docker Compose ports for PostgreSQL and Redis are bound to `127.0.0.1` for local development; do not expose these services publicly. ### Retrieval limits in this preview

The full-workspace API currently stores embeddings as JSONB and computes cosine similarity in bounded, ordered batches (128 chunks per database query). It searches all active chunks **only when the workspace contains at most 2,048 chunks**. Larger corpora receive an explicit 503 instead of an incomplete answer; a database-native vector index such as pgvector is required before serving larger datasets. This bound limits per-request API memory but is **not** an indexed, low-latency production retrieval implementation. Server-side query/embedding quotas, global request-rate enforcement, and real-provider acceptance remain release gates.

The API and worker must use the same `UPLOAD_DIR` and have read/write access to it. The default is the repository's `storage/uploads` directory. In a multi-container deployment, mount a shared persistent volume at that same path. Keep `.env` outside source control and use a separate strong PostgreSQL password and TLS-protected services outside local development.

## Full-app workflow

1. Sign in through Clerk and create a workspace. Workspace membership is stored in PostgreSQL; the active organization header is checked against that membership on every tenant-scoped API operation.
2. Open **Documents** and upload a text-based PDF, TXT, or Markdown file up to 10 MB. The API validates the file, stores it, and queues indexing in Redis. The worker extracts text, chunks it, obtains embeddings, and atomically replaces that document's persisted chunks.
3. Ask a question in **Chat**. The API verifies the Clerk bearer token, checks the user, workspace membership, and session ownership, retrieves top passages for that workspace only, streams the generated answer, and saves the answer together with source metadata.

Scanned/image-only PDFs and OCR are not supported. Drive and Slack connectors are not enabled in this release. Chat answers require configured OpenAI access; do not treat model output as a substitute for reviewing the cited source documents.

## Environment

See [.env.example](.env.example) for all variable names and local defaults. `DATABASE_URL`, `REDIS_URL`, `API_PORT`, `WEB_URL`, and `UPLOAD_DIR` are used by the backend. `API_URL` configures the Next.js server-side proxy target. `LITE_MODE_ENABLED` controls whether production Lite Mode routes are available; `LITE_MODE_AI_ENABLED` controls optional Lite Mode model spending (default `false`). `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` is public by design; `CLERK_SECRET_KEY` and `OPENAI_API_KEY` are secrets and must never be committed.

## Checks

```bash
npm run lint
npm test
npm run build
npm audit --audit-level=high
```

The unit tests cover chunking, retrieval ranking, Lite Mode visitor isolation and rejection of unauthorized organization scopes. The full end-to-end flow requires live Clerk and OpenAI credentials plus running PostgreSQL and Redis services.

## Authenticated API request quotas

The API uses a Redis-backed atomic counter per authenticated internal user ID to fail closed across API replicas when the request quota is exceeded:

| Operation | Current engineering-preview limit |
| --- | --- |
| Chat stream | 20 requests/minute/user |
| Document upload | 3 uploads/hour/user |
| Workspace creation | 5 workspaces/day/user |

Quota keys are SHA-256 hashes of the internal user identifier; no bearer tokens are persisted in the limiter keys. Redis outages reject quota-protected actions rather than permitting unbounded model spending. Quotas apply before chat message persistence and model calls.

These limits provide only **per-authenticated-user request counts**. They do not substitute for a trusted edge enforcing IP/origin abuse limits, quotas on actual OpenAI tokens and embedding volume, subscription entitlements, or tenant-wide budgets. Those controls remain required for production use.

## Deployment and security acceptance

This is an implementation branch, not a certification. Before enabling access for customers, verify all the following in an independently managed environment:

- Real Clerk authentication, authorized web origins, missing/expired/revoked tokens, organization membership, and cross-user session isolation (including the streaming endpoint).
- Upload validation, tenant-scoped ingestion, atomic chunk replacement, queue retries, and worker/API shared upload durability.
- Authentication-aware and IP-aware quotas for uploads, chat streams, workspace creation, and Lite Mode creation; a trusted edge must enforce public Lite Mode rate limits before enabling it.
- Capped memory, tokens, and spending for embedding and generation requests; retrieval must be bounded at database level for large corpora.
- PostgreSQL migration validation against populated legacy data, backups, rollback, and private transport for Redis, PostgreSQL, and upload volumes.
- Error handling that distinguishes invalid credentials (401) from service failures (5xx), plus observability and provider-backed acceptance tests.

**Unverified areas:** live production Clerk/OpenAI, large-corpus performance, public abuse resistance, a documented upload retention/deletion policy, and independent end-to-end signoff. Passing mocks, builds, or unit tests does not remove these gates.

## Interfaces and project structure

| Component | Path | Purpose |
| --- | --- | --- |
| Web app | `apps/web` | Authenticated documents/chat, Lite Mode, workspace UI |
| API | `apps/api` | Fastify/tRPC auth, sources, sessions and SSE streaming |
| Worker | `apps/worker` | Queue-based text extraction, embedding and indexing |
| Data | `packages/db` | PostgreSQL migrations and tenant-scoped persistence |
| Retrieval | `packages/ai` | Chunking, embeddings, retrieval ranking and generation |
| Configuration | `packages/config` | Environment schema and operational constants |

Report security concerns privately via [SECURITY.md](SECURITY.md); development guidance lives in [CONTRIBUTING.md](CONTRIBUTING.md).
