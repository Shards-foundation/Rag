# Lumina - Enterprise AI Knowledge Hub

A high-fidelity RAG platform for enterprise document search and chat.

## Tech Stack
- **Frontend**: Next.js 14 (App Router), Tailwind, tRPC.
- **Backend**: Fastify, tRPC, BullMQ.
- **Data**: PostgreSQL (pg), Redis, In-Memory Vector Store.
- **AI**: OpenAI (Embeddings + Chat Completion).

## Prerequisites
- Node.js v20+
- pnpm
- Docker (for Postgres/Redis) OR local instances.

## Quick Start

1. **Install Dependencies**
   ```bash
   pnpm install
   ```

2. **Environment Configuration**
   Copy `.env.example` to `.env` and fill in your keys.
   - `OPENAI_API_KEY`: Required for real AI responses.
   - `CLERK_*`: Required for auth (or use dev backdoor).
   
   **Minimum .env:**
   ```ini
   DATABASE_URL="postgresql://postgres:postgres@localhost:5432/lumina"
   REDIS_URL="redis://localhost:6379"
   API_PORT="3001"
   WEB_URL="http://localhost:3000"
   ```

3. **Initialize System**
   This creates DB tables and ensures upload directories exist.
   ```bash
   pnpm run db:init
   ```

4. **Run All Services**
   Starts Web, API, and Worker concurrently.
   ```bash
   pnpm run dev:all
   ```

## Lite Mode
For resource-constrained environments (like AI Studio Preview), runs in-memory without Postgres/Redis.
```bash
pnpm dev:web
```
Access at `http://localhost:3000/chat`.
