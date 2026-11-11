# Shards RAG

**Retrieval-augmented generation workspace — engineering preview.**

Shards RAG is a document-search and AI-assisted question-answering project maintained by [Shards Foundation](https://github.com/Shards-foundation). Its internal workspace/package names currently use the legacy **Lumina** identifier (`@lumina/*`); the product name and npm package names are not yet aligned.

> **Deployment status:** The `main` branch is an incomplete development scaffold, **not a production-ready or security-approved service**. In particular, its API accepts caller-supplied identity headers in protected procedures, and some organization actions are publicly exposed. Do not deploy `main` to the public internet, connect customer data, or treat its tenant boundaries as trustworthy. The proposed verified-authentication and ingestion implementation is in [PR #43](https://github.com/Shards-foundation/Shards-Rag/pull/43), which is still a draft pending security and acceptance gates.

## Intended workflow

1. Ingest supported documents and extract readable text.
2. Split content into bounded chunks, generate embeddings, and store the chunks with workspace-scoped metadata.
3. Retrieve relevant passages for a user question; generate a source-grounded answer and expose citations.
4. Apply verified identity, organization membership, session ownership, quotas, and audit controls at each service boundary.

These are **target capabilities**, not a claim that every stage is complete on `main`.

## Repository layout

| Path | Responsibility |
| --- | --- |
| `apps/web/` | Next.js user interface and Lite Mode routes |
| `apps/api/` | Fastify/tRPC API |
| `apps/worker/` | Background ingestion worker |
| `packages/ai/` | AI, embeddings, and retrieval helpers |
| `packages/db/` | PostgreSQL data access and schema |
| `packages/config/` | Runtime configuration |
| `packages/types/` | Shared TypeScript types |
| `packages/ui/` | Shared UI elements |

## Developer setup (current `main` scaffold)

**Prerequisites:** Node.js 22 and npm 10, with PostgreSQL and Redis available for the intended full-stack path. The root package declares `npm@10.8.2`; use npm rather than the legacy pnpm instructions.

```bash
git clone https://github.com/Shards-foundation/Shards-Rag.git
cd Shards-Rag
npm ci
npm run dev:web
```

The web development server is configured for `http://localhost:3000`. Additional workspace commands are:

```bash
npm run dev:all    # Web, API, and worker (requires backing services)
npm run db:init    # Database initialisation script
npm run build      # Workspace builds
npm run test       # Workspace tests, where defined
npm run lint       # Workspace lint commands, where defined
```

**Important:** On `main`, `.env.example` is currently empty, and the full-stack startup, authentication, database migrations, and document pipeline have not been accepted as a reproducible deployment. Do not infer successful end-to-end operation from these command names. Use the [PR #43 branch README](https://github.com/Shards-foundation/Shards-Rag/blob/manus/complete-product-20261104/README.md) for proposed PostgreSQL/Redis/OpenAI/Clerk setup, subject to its outstanding review.

## Current status and limitations

| Capability | `main` | Proposed in PR #43 |
| --- | --- | --- |
| Next.js web scaffold | Present | Expanded application UI |
| Fastify/tRPC API | Present; unsafe caller-header trust | Verified Clerk identity and membership |
| Persistent document indexing | Not accepted end to end | PostgreSQL, worker, Redis/BullMQ, PDF/TXT/Markdown |
| Grounded answer citations | Not accepted end to end | Streaming answers with stored citation excerpts |
| Lite Mode | UI scaffold present | Visitor-isolated, memory-backed document retrieval |
| Production security | **Not approved** | Still requires abuse controls, tests, and real-provider checks |

Lite Mode is not durable storage. Avoid uploading secrets, personal information, or sensitive documents to untrusted instances. Scanned/image-only PDFs are not covered by the proposed text extraction workflow.

## Security and release gates

Before a production release, maintainers must demonstrate: verified identity and tenant isolation; cross-workspace and cross-user access rejection; bounded uploads, ingestion, model spend, and retrieval; database migration and rollback testing; durable queue/retry behaviour; source-backed answers; real-provider smoke tests; and green CI plus independent review. In particular, do **not** merge a large feature solely because unit tests or a build pass.

Please report vulnerabilities privately following [SECURITY.md](SECURITY.md). See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance. The code is licensed under [MIT](LICENSE).
