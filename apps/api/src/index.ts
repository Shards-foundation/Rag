import Fastify from "fastify";
import cors from "@fastify/cors";
import { CONSTANTS, env, requireEnvironment } from "@lumina/config";
import { appRouter } from "./router";
import { createContext } from "./router/context";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { chatStreamHandler } from "./router/chatStream";
import { checkIngestionQueueHealth, closeIngestionQueue } from "./router/sources";
import { pool, query } from "@lumina/db";
import process from "node:process";
import { mkdir } from "node:fs/promises";

const server = Fastify({
  logger: true,
  bodyLimit: Math.ceil(CONSTANTS.MAX_UPLOAD_BYTES * 4 / 3) + 1024 * 1024,
});

async function main(): Promise<void> {
  requireEnvironment("DATABASE_URL", "REDIS_URL", "CLERK_SECRET_KEY", "OPENAI_API_KEY");
  await mkdir(CONSTANTS.UPLOAD_DIR, { recursive: true });
  await query("SELECT 1");
  await checkIngestionQueueHealth();

  await server.register(cors, {
    origin: env.WEB_URL,
    credentials: true,
    methods: ["GET", "POST", "OPTIONS"],
    allowedHeaders: ["Authorization", "Content-Type", "X-Org-Id"],
    maxAge: 600,
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext },
  });

  server.post("/api/chat/stream", chatStreamHandler);
  server.get("/health", async (_request, reply) => {
    try {
      await query("SELECT 1");
      await checkIngestionQueueHealth();
      return { status: "ok" };
    } catch {
      reply.code(503);
      return { status: "unavailable" };
    }
  });

  await server.listen({ port: env.API_PORT, host: "0.0.0.0" });
  server.log.info({ port: env.API_PORT }, "RAG API is ready");
}

async function shutdown(signal: string): Promise<void> {
  server.log.info({ signal }, "Closing API server");
  await server.close();
  await closeIngestionQueue();
  await pool.end();
  process.exit(0);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));

main().catch((error: unknown) => {
  server.log.error(error, "API failed to start");
  process.exitCode = 1;
});
