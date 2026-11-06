import { createClerkClient, verifyToken } from "@clerk/backend";
import { inferAsyncReturnType, TRPCError } from "@trpc/server";
import type { CreateFastifyContextOptions } from "@trpc/server/adapters/fastify";
import { getMembershipForUserInOrg, getUserByClerkUserId, upsertUser } from "@lumina/db";
import { env } from "@lumina/config";

let clerkClient: ReturnType<typeof createClerkClient> | null = null;
function getClerkClient() {
  if (!env.CLERK_SECRET_KEY) throw new Error("CLERK_SECRET_KEY is required for authenticated API access");
  clerkClient ??= createClerkClient({ secretKey: env.CLERK_SECRET_KEY });
  return clerkClient;
}

export type ApiIdentity = { userId: string; clerkUserId: string };

export async function verifyRequestIdentity(authorization: string | undefined): Promise<ApiIdentity | null> {
  if (!authorization) return null;
  const match = /^Bearer\s+([^\s]+)$/i.exec(authorization.trim());
  if (!match || !env.CLERK_SECRET_KEY) return null;

  try {
    const claims = await verifyToken(match[1], {
      secretKey: env.CLERK_SECRET_KEY,
      authorizedParties: [env.WEB_URL],
    });
    const clerkUserId = claims?.sub;
    if (typeof clerkUserId !== "string" || !clerkUserId) return null;

    let user = await getUserByClerkUserId(clerkUserId);
    if (!user) {
      const clerkUser = await getClerkClient().users.getUser(clerkUserId);
      const primaryEmail = clerkUser.emailAddresses.find((email) => email.id === clerkUser.primaryEmailAddressId);
      if (!primaryEmail?.emailAddress || primaryEmail.verification?.status !== "verified") return null;
      const name = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(" ") || null;
      user = await upsertUser(clerkUserId, primaryEmail.emailAddress, name);
    }
    return { userId: user.id, clerkUserId };
  } catch (error) {
    // Do not log bearer tokens or user profile details.
    console.warn("Clerk authentication failed", error instanceof Error ? error.name : "unknown error");
    return null;
  }
}

export async function requireOrganizationMembership(userId: string, organizationId: string | undefined) {
  if (!organizationId) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Select an organization first." });
  }
  const membership = await getMembershipForUserInOrg(userId, organizationId);
  if (!membership) {
    throw new TRPCError({ code: "FORBIDDEN", message: "You do not have access to this organization." });
  }
  return membership;
}

export async function createContext({ req, res }: CreateFastifyContextOptions) {
  const identity = await verifyRequestIdentity(req.headers.authorization);
  const orgHeader = req.headers["x-org-id"];
  const organizationId = typeof orgHeader === "string" && orgHeader.trim() ? orgHeader.trim() : null;
  return {
    req,
    res,
    userId: identity?.userId ?? null,
    clerkUserId: identity?.clerkUserId ?? null,
    organizationId,
  };
}

export type Context = inferAsyncReturnType<typeof createContext>;
