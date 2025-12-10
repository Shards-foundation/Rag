import { z } from "zod";
import dotenv from "dotenv";
import path from "path";

// Load .env from root
dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
  DATABASE_URL: z.string().min(1, "DATABASE_URL is required"),
  REDIS_URL: z.string().default("redis://localhost:6379"),
  OPENAI_API_KEY: z.string().optional(),
  CLERK_SECRET_KEY: z.string().optional(),
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: z.string().optional(),
  API_PORT: z.string().default("3001"),
  WEB_URL: z.string().default("http://localhost:3000"),
});

const parsed = envSchema.safeParse(process.env);

if (!parsed.success) {
  // Warn but don't exit to allow Lite mode in some envs
  console.warn("⚠️ Invalid environment variables for full mode:", parsed.error.flatten().fieldErrors);
}

export const env = parsed.success ? parsed.data : process.env as any;

export const CONSTANTS = {
  DEFAULT_TOP_K: 5,
  CHUNK_SIZE_CHARS: 1000,
  CHUNK_OVERLAP_CHARS: 200,
  VECTOR_STORE_FILE_PATH: path.resolve(process.cwd(), "tmp-vector-store.json"),
  UPLOAD_DIR: path.resolve(process.cwd(), "storage/uploads")
};