import { initTRPC, TRPCError } from "@trpc/server";
import type { Context } from "./context";
import { requireOrganizationMembership } from "./context";

const t = initTRPC.context<Context>().create();

export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const router = t.router;

const isAuthenticated = middleware(({ ctx, next }) => {
  if (!ctx.userId || !ctx.clerkUserId) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Sign in to continue." });
  }
  return next({ ctx: { ...ctx, userId: ctx.userId, clerkUserId: ctx.clerkUserId } });
});

export const authenticatedProcedure = t.procedure.use(isAuthenticated);

const hasOrganizationMembership = middleware(async ({ ctx, next }) => {
  if (!ctx.userId) throw new TRPCError({ code: "UNAUTHORIZED" });
  const membership = await requireOrganizationMembership(ctx.userId, ctx.organizationId ?? undefined);
  return next({
    ctx: {
      ...ctx,
      userId: ctx.userId,
      organizationId: membership.organizationId,
      membershipRole: membership.role,
    },
  });
});

export const protectedProcedure = authenticatedProcedure.use(hasOrganizationMembership);
