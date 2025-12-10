import Fastify from "fastify";
import cors from "@fastify/cors";
import { env, CONSTANTS } from "@lumina/config";
import { appRouter } from "./router";
import { createContext } from "./router/context";
import { fastifyTRPCPlugin } from "@trpc/server/adapters/fastify";
import { chatStreamHandler } from "./router/chatStream";
import process from "process";
import * as fs from "fs";
import * as path from "path";

const server = Fastify({
  logger: true,
});

async function main() {
  const uploadDir = path.resolve(CONSTANTS.UPLOAD_DIR);
  if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
  }

  await server.register(cors, {
    origin: "*", 
  });

  await server.register(fastifyTRPCPlugin, {
    prefix: "/trpc",
    trpcOptions: { router: appRouter, createContext },
  });

  server.post("/api/chat/stream", chatStreamHandler);

  server.get("/health", async () => {
    return { status: "ok" };
  });

  try {
    await server.listen({ port: parseInt(env.API_PORT), host: "0.0.0.0" });
    console.log(`🚀 API running on port ${env.API_PORT}`);
  } catch (err) {
    server.log.error(err);
    process.exit(1);
  }
}

main();