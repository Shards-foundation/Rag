import { beforeEach, describe, expect, it, vi } from "vitest";
import { TRPCError } from "@trpc/server";

const mocks = vi.hoisted(() => ({
  verifyRequestIdentity: vi.fn(),
  requireOrganizationMembership: vi.fn(),
  getChatSessionForUser: vi.fn(),
  createMessage: vi.fn(),
  listOrganizationChunks: vi.fn(),
  query: vi.fn(),
  embedText: vi.fn(),
  generateAnswerStream: vi.fn(),
  rankChunks: vi.fn(),
  enforceUserRateLimit: vi.fn(),
}));

vi.mock("./context", () => ({
  verifyRequestIdentity: mocks.verifyRequestIdentity,
  requireOrganizationMembership: mocks.requireOrganizationMembership,
}));
vi.mock("@lumina/db", () => ({
  getChatSessionForUser: mocks.getChatSessionForUser,
  createMessage: mocks.createMessage,
  listOrganizationChunks: mocks.listOrganizationChunks,
  query: mocks.query,
}));
vi.mock("@lumina/ai", () => ({
  embedText: mocks.embedText,
  generateAnswerStream: mocks.generateAnswerStream,
  rankChunks: mocks.rankChunks,
}));
vi.mock("./rateLimit", () => ({ enforceUserRateLimit: mocks.enforceUserRateLimit }));
vi.mock("@lumina/config", () => ({
  env: { WEB_URL: "http://localhost:3000" },
  CONSTANTS: { DEFAULT_TOP_K: 5 },
}));

import { chatStreamHandler } from "./chatStream";

function request(headers: Record<string, string> = {}) {
  return {
    body: { sessionId: "11111111-1111-4111-8111-111111111111", message: "What does the document say?" },
    headers: { authorization: "Bearer signed-session-token", "x-org-id": "org-1", ...headers },
  };
}
function reply() {
  const target = { code: vi.fn(), header: vi.fn(), send: vi.fn() };
  target.code.mockReturnValue(target);
  target.header.mockReturnValue(target);
  return target;
}

describe("chat stream authorization boundary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.verifyRequestIdentity.mockResolvedValue({ userId: "user-1", clerkUserId: "clerk-1" });
    mocks.requireOrganizationMembership.mockResolvedValue({ organizationId: "org-1", userId: "user-1", role: "MEMBER" });
    mocks.getChatSessionForUser.mockResolvedValue(null);
    mocks.enforceUserRateLimit.mockResolvedValue(undefined);
  });

  it("rejects callers without a verified identity before database access", async () => {
    mocks.verifyRequestIdentity.mockResolvedValue(null);
    const res = reply();
    await chatStreamHandler(request(), res);
    expect(res.code).toHaveBeenCalledWith(401);
    expect(res.send).toHaveBeenCalledWith({ error: "Sign in to chat." });
    expect(mocks.getChatSessionForUser).not.toHaveBeenCalled();
  });

  it("rejects unauthorized organization membership", async () => {
    mocks.requireOrganizationMembership.mockRejectedValue(new TRPCError({ code: "FORBIDDEN" }));
    const res = reply();
    await chatStreamHandler(request({ "x-org-id": "org-other" }), res);
    expect(res.code).toHaveBeenCalledWith(403);
    expect(mocks.requireOrganizationMembership).toHaveBeenCalledWith("user-1", "org-other");
    expect(mocks.getChatSessionForUser).not.toHaveBeenCalled();
  });

  it("does not classify organization database outages as forbidden", async () => {
    mocks.requireOrganizationMembership.mockRejectedValue(new Error("database unavailable"));
    const res = reply();
    await expect(chatStreamHandler(request(), res)).rejects.toThrow("database unavailable");
    expect(res.code).not.toHaveBeenCalledWith(403);
  });

  it("rejects attempts to stream another user’s session", async () => {
    const res = reply();
    await chatStreamHandler(request(), res);
    expect(res.code).toHaveBeenCalledWith(404);
    expect(mocks.getChatSessionForUser).toHaveBeenCalledWith("11111111-1111-4111-8111-111111111111", "org-1", "user-1");
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("throttles valid chat sessions before persisting messages or spending model tokens", async () => {
    mocks.getChatSessionForUser.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    mocks.enforceUserRateLimit.mockRejectedValue(new TRPCError({ code: "TOO_MANY_REQUESTS", message: "Rate limit exceeded." }));
    const res = reply();
    await chatStreamHandler(request(), res);
    expect(mocks.enforceUserRateLimit).toHaveBeenCalledWith("chat", "user-1");
    expect(res.code).toHaveBeenCalledWith(429);
    expect(res.header).toHaveBeenCalledWith("Retry-After", "60");
    expect(mocks.createMessage).not.toHaveBeenCalled();
    expect(mocks.embedText).not.toHaveBeenCalled();
  });

  it("fails closed when shared Redis quota service is unavailable", async () => {
    mocks.getChatSessionForUser.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
    mocks.enforceUserRateLimit.mockRejectedValue(new TRPCError({ code: "INTERNAL_SERVER_ERROR" }));
    await expect(chatStreamHandler(request(), reply())).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
    expect(mocks.createMessage).not.toHaveBeenCalled();
  });

  it("rejects missing organization selection before the membership lookup", async () => {
    const res = reply();
    await chatStreamHandler(request({ "x-org-id": "" }), res);
    expect(res.code).toHaveBeenCalledWith(400);
    expect(mocks.requireOrganizationMembership).not.toHaveBeenCalled();
  });
});
