import Redis from "ioredis";
import { createHash } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { env } from "@lumina/config";

export type RateLimitAction = "chat" | "upload" | "create-org";

// The counter and expiration must be atomic. If Redis is unavailable, fail
// closed rather than letting every process independently permit model spend.
const RATE_LIMIT_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if count == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return {count, redis.call('TTL', KEYS[1])}
`;

let redis: Redis | null = null;
function client(): Redis {
  redis ??= new Redis(env.REDIS_URL, {
    lazyConnect: true,
    connectTimeout: 2_000,
    maxRetriesPerRequest: 1,
    retryStrategy: () => null,
  });
  return redis;
}

export const RATE_LIMITS: Record<RateLimitAction, { max: number; windowSeconds: number }> = {
  chat: { max: 20, windowSeconds: 60 },
  upload: { max: 3, windowSeconds: 3_600 },
  "create-org": { max: 5, windowSeconds: 86_400 },
};

export async function enforceUserRateLimit(action: RateLimitAction, userId: string): Promise<void> {
  if (!userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const config = RATE_LIMITS[action];
  const identityHash = createHash("sha256").update(userId).digest("hex");
  const key = `shards-rag:rate:v1:${action}:${identityHash}`;
  let result: unknown;
  try {
    const conn = client();
    if (conn.status === "wait") await conn.connect();
    result = await conn.eval(RATE_LIMIT_SCRIPT, 1, key, String(config.windowSeconds));
  } catch {
    // Do not leak Redis connection details or permit costly requests on outage.
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Request limits are temporarily unavailable." });
  }
  if (!Array.isArray(result) || result.length !== 2 ||
      !Number.isInteger(Number(result[0])) || !Number.isInteger(Number(result[1]))) {
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Request limits returned an invalid response." });
  }
  const count = Number(result[0]);
  const ttl = Number(result[1]);
  if (count > config.max) {
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Rate limit exceeded. Retry in ${Math.max(1, ttl)} seconds.`,
    });
  }
}

export async function closeRateLimiter(): Promise<void> {
  if (!redis) return;
  const conn = redis;
  redis = null;
  if (conn.status === "ready") await conn.quit();
  else conn.disconnect();
}
