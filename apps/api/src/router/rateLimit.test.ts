import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  eval: vi.fn(),
  connect: vi.fn(),
  quit: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("ioredis", () => ({
  default: class RedisMock {
    status = "ready";
    eval = mocks.eval;
    connect = mocks.connect;
    quit = mocks.quit;
    disconnect = mocks.disconnect;
  },
}));
vi.mock("@lumina/config", () => ({ env: { REDIS_URL: "redis://localhost:6379" } }));

import { closeRateLimiter, enforceUserRateLimit } from "./rateLimit";

describe("distributed model and mutation quota enforcement", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.eval.mockResolvedValue([1, 60]);
  });
  afterEach(async () => { await closeRateLimiter(); });

  it("permits requests under the atomic Redis limit without storing raw identities", async () => {
    await expect(enforceUserRateLimit("chat", "user-private-id")).resolves.toBeUndefined();
    expect(mocks.eval).toHaveBeenCalledWith(
      expect.stringContaining("redis.call('INCR'"),
      1,
      expect.stringContaining("shards-rag:rate:v1:chat:"),
      "60",
    );
    const key = mocks.eval.mock.calls[0][2] as string;
    expect(key).not.toContain("user-private-id");
  });

  it("fails closed after the configured chat quota is exceeded", async () => {
    mocks.eval.mockResolvedValue([21, 15]);
    await expect(enforceUserRateLimit("chat", "user-a")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
      message: expect.stringContaining("15 seconds"),
    });
  });

  it("requires identity before contacting Redis", async () => {
    await expect(enforceUserRateLimit("upload", "")).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.eval).not.toHaveBeenCalled();
  });

  it("enforces a more restrictive hourly upload quota", async () => {
    mocks.eval.mockResolvedValue([4, 120]);
    await expect(enforceUserRateLimit("upload", "user-a")).rejects.toMatchObject({
      code: "TOO_MANY_REQUESTS",
    });
    expect(mocks.eval.mock.calls[0][3]).toBe("3600");
  });

  it("fails closed when Redis is unreachable or responds with malformed data", async () => {
    mocks.eval.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    await expect(enforceUserRateLimit("create-org", "user-a")).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
    mocks.eval.mockResolvedValueOnce("invalid");
    await expect(enforceUserRateLimit("create-org", "user-a")).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });
});
