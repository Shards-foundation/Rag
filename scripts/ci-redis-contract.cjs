/* Real Redis 7 quota contract. CI-only, isolated credentials. */
const assert = require("node:assert/strict");
const { randomUUID } = require("node:crypto");
const { spawnSync } = require("node:child_process");

if (process.env.GITHUB_ACTIONS !== "true") {
  throw new Error("This contract is intended only for isolated GitHub Actions services.");
}
const redisUrl = new URL(process.env.REDIS_URL || "");
if (!["localhost", "127.0.0.1"].includes(redisUrl.hostname)) {
  throw new Error("Refusing to run the quota contract against non-loopback Redis.");
}

const { enforceUserRateLimit, closeRateLimiter } = require("../apps/api/dist/router/rateLimit.js");

async function main() {
  if (process.argv[2] === "single") {
    try {
      await enforceUserRateLimit("chat", process.argv[3]);
    } finally {
      await closeRateLimiter();
    }
    return;
  }
  const user = `ci-chat-${randomUUID()}`;
  try {
    for (let i = 0; i < 19; i++) await enforceUserRateLimit("chat", user);
    // A distinct process must see the same Redis counter for the 20th call.
    const child = spawnSync(process.execPath, [__filename, "single", user], {
      encoding: "utf8", env: process.env, timeout: 15_000,
    });
    assert.equal(child.status, 0, `Cross-process quota not shared: ${child.stderr}`);
    await assert.rejects(
      enforceUserRateLimit("chat", user),
      (error) => error.code === "TOO_MANY_REQUESTS",
    );

    const uploader = `ci-upload-${randomUUID()}`;
    for (let i = 0; i < 3; i++) await enforceUserRateLimit("upload", uploader);
    await assert.rejects(
      enforceUserRateLimit("upload", uploader),
      (error) => error.code === "TOO_MANY_REQUESTS",
    );

    const concurrently = `ci-race-${randomUUID()}`;
    const attempts = await Promise.allSettled(
      Array.from({ length: 25 }, () => enforceUserRateLimit("chat", concurrently)),
    );
    assert.equal(attempts.filter((x) => x.status === "fulfilled").length, 20);
    assert.equal(attempts.filter((x) => x.status === "rejected" && x.reason?.code === "TOO_MANY_REQUESTS").length, 5);
    console.log("Redis quota contract PASS: cross-process sharing, upload quota, 25 concurrent attempts => 20 ALLOW / 5 DENY.");
  } finally {
    await closeRateLimiter();
  }
}

main().then(() => {
  if (process.argv[2] === "single") console.log("Cross-process request permitted.");
}).catch((error) => {
  console.error("Redis quota contract FAILED:", error);
  process.exitCode = 1;
});
