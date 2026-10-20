import { initTRPC, TRPCError } from "@trpc/server";
import { Context } from "./context";

const t = initTRPC.context<Context>().create();

export const middleware = t.middleware;
export const publicProcedure = t.procedure;
export const router = t.router;

const isAuthed = middleware(async ({ ctx, next }) => {
  const userId = ctx.req.headers["x-user-id"] as string;
  const organizationId = ctx.req.headers["x-org-id"] as string;

  if (!userId) {
    throw new TRPCError({ code: "UNAUTHORIZED" });
  }

  return next({
    ctx: {
      ...ctx,
      userId,
      organizationId,
    },
  });
});

export const protectedProcedure = t.procedure.use(isAuthed);
