import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";

const mocks = vi.hoisted(() => ({
  verifyToken: vi.fn(),
  getUserByClerkUserId: vi.fn(),
  upsertUser: vi.fn(),
  getMembershipForUserInOrg: vi.fn(),
  createClerkClient: vi.fn(),
}));

vi.mock("@clerk/backend", () => ({
  createClerkClient: mocks.createClerkClient,
  verifyToken: mocks.verifyToken,
}));
vi.mock("@lumina/config", () => ({
  env: { CLERK_SECRET_KEY: "sk_test_unit", WEB_URL: "http://localhost:3000" },
}));
vi.mock("@lumina/db", () => ({
  getMembershipForUserInOrg: mocks.getMembershipForUserInOrg,
  getUserByClerkUserId: mocks.getUserByClerkUserId,
  upsertUser: mocks.upsertUser,
}));

import { authenticatedProcedure, protectedProcedure, router } from "./trpc";
import { createContext, verifyRequestIdentity } from "./context";

describe("API identity security", () => {
  beforeEach(() => vi.clearAllMocks());

  it("ignores browser-supplied identity headers and rejects protected calls without a verified bearer token", async () => {
    const context = await createContext({
      req: { headers: { "x-user-id": "victim-user", "x-org-id": "unverified-org" } },
      res: {},
    } as unknown as CreateFastifyContextOptions);

    expect(context.userId).toBeNull();
    expect(context.clerkUserId).toBeNull();
    expect(context.organizationId).toBe("unverified-org");

    const protectedRouter = router({ identity: authenticatedProcedure.query(({ ctx }) => ctx.userId) });
    const caller = protectedRouter.createCaller(context);
    await expect(caller.identity()).rejects.toMatchObject({ code: "UNAUTHORIZED" });
    expect(mocks.verifyToken).not.toHaveBeenCalled();
  });

  it("accepts a valid Clerk token's decoded payload returned by the public SDK export", async () => {
    mocks.verifyToken.mockResolvedValue({ sub: "user_verified" });
    mocks.getUserByClerkUserId.mockResolvedValue({
      id: "db-user-1",
      clerkUserId: "user_verified",
      email: "verified@example.com",
      name: "Verified User",
    });

    await expect(verifyRequestIdentity("Bearer signed-session-token")).resolves.toEqual({
      userId: "db-user-1",
      clerkUserId: "user_verified",
    });
    expect(mocks.verifyToken).toHaveBeenCalledWith("signed-session-token", {
      secretKey: "sk_test_unit",
      authorizedParties: ["http://localhost:3000"],
    });
  });

  it("rejects tokens when Clerk verification throws", async () => {
    mocks.verifyToken.mockRejectedValue(new Error("invalid signature"));
    const warning = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    await expect(verifyRequestIdentity("Bearer forged-token")).resolves.toBeNull();
    warning.mockRestore();
  });

  it("rejects a verified user who is not a member of the requested organization", async () => {
    mocks.verifyToken.mockResolvedValue({ sub: "user_verified" });
    mocks.getUserByClerkUserId.mockResolvedValue({ id: "db-user-1", clerkUserId: "user_verified" });
    mocks.getMembershipForUserInOrg.mockResolvedValue(null);
    const context = await createContext({
      req: { headers: { authorization: "Bearer signed-session-token", "x-org-id": "foreign-org" } },
      res: {},
    } as unknown as CreateFastifyContextOptions);
    const protectedRouter = router({ org: protectedProcedure.query(({ ctx }) => ctx.organizationId) });
    await expect(protectedRouter.createCaller(context).org()).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.getMembershipForUserInOrg).toHaveBeenCalledWith("db-user-1", "foreign-org");
  });

  it("requires a selected organization even with a verified bearer token", async () => {
    mocks.verifyToken.mockResolvedValue({ sub: "user_verified" });
    mocks.getUserByClerkUserId.mockResolvedValue({ id: "db-user-1", clerkUserId: "user_verified" });
    const context = await createContext({
      req: { headers: { authorization: "Bearer signed-session-token" } },
      res: {},
    } as unknown as CreateFastifyContextOptions);
    const protectedRouter = router({ org: protectedProcedure.query(({ ctx }) => ctx.organizationId) });
    await expect(protectedRouter.createCaller(context).org()).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(mocks.getMembershipForUserInOrg).not.toHaveBeenCalled();
  });

  it("accepts only the database-confirmed membership scope", async () => {
    mocks.verifyToken.mockResolvedValue({ sub: "user_verified" });
    mocks.getUserByClerkUserId.mockResolvedValue({ id: "db-user-1", clerkUserId: "user_verified" });
    mocks.getMembershipForUserInOrg.mockResolvedValue({ organizationId: "allowed-org", userId: "db-user-1", role: "ADMIN" });
    const context = await createContext({
      req: { headers: { authorization: "Bearer signed-session-token", "x-org-id": "allowed-org" } },
      res: {},
    } as unknown as CreateFastifyContextOptions);
    const protectedRouter = router({ org: protectedProcedure.query(({ ctx }) => ctx.organizationId) });
    await expect(protectedRouter.createCaller(context).org()).resolves.toBe("allowed-org");
  });


  it("surfaces database outages instead of silently classifying them as invalid credentials", async () => {
    mocks.verifyToken.mockResolvedValue({ sub: "user_verified" });
    mocks.getUserByClerkUserId.mockRejectedValue(new Error("database unavailable"));
    await expect(verifyRequestIdentity("Bearer signed-session-token")).rejects.toThrow("database unavailable");
  });

});
