import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Use a stable monorepo-relative path: Turbo runs API and worker from different
// workspaces, so resolving .env or shared storage from process.cwd() is unsafe.
dotenv.config({ path: path.resolve(__dirname, "../../../.env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().optional(),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  OPENAI_API_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(3001),
  WEB_URL: z.string().url().default("http://localhost:3000"),
  UPLOAD_DIR: z.string().optional(),
  OPENAI_CHAT_MODEL: z.string().default("gpt-4o-mini"),
});

export const env = envSchema.parse(process.env);

export function requireEnvironment(...keys: (keyof typeof env)[]): void {
  const missing = keys.filter((key) => !env[key]);
  if (missing.length > 0) {
    throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
  }
}

const repositoryRoot = path.resolve(__dirname, "../../../");

export const CONSTANTS = {
  DEFAULT_TOP_K: 5,
  CHUNK_SIZE_CHARS: 1000,
  CHUNK_OVERLAP_CHARS: 200,
  MAX_UPLOAD_BYTES: 10 * 1024 * 1024,
  UPLOAD_DIR: path.resolve(repositoryRoot, env.UPLOAD_DIR || "storage/uploads"),
};
