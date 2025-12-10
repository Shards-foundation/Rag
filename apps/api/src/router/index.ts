import { initTRPC, TRPCError } from "@trpc/server";
import { Context } from "./context";
import { z } from "zod";
import { sourcesRouter } from "./sources";
import { teamRouter } from "./team";
import { chatRouter } from "./chat";
import { query, getUserByClerkUserId, createUser, createOrganization, createMembership, User, Membership } from "@lumina/db";
import { randomUUID } from "crypto";

const t = initTRPC.context<Context>().create();

export const middleware = t.middleware;
export const publicProcedure = t.procedure;

const isAuthed = middleware(async ({ ctx, next }) => {
  const userId = ctx.req.headers['x-user-id'] as string;
  const organizationId = ctx.req.headers['x-org-id'] as string;

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

export const appRouter = t.router({
  health: publicProcedure.query(() => "ok"),
  sources: sourcesRouter(t, protectedProcedure),
  team: teamRouter(t, protectedProcedure),
  chat: chatRouter(t, protectedProcedure),
  
  me: publicProcedure
    .input(z.object({ clerkId: z.string(), email: z.string() }))
    .mutation(async ({ input }) => {
      let user = await getUserByClerkUserId(input.clerkId);
      if (!user) {
        user = await createUser(randomUUID(), input.clerkId, input.email);
      }

      const { rows: memberships } = await query<Membership & { orgName: string, orgId: string }>(`
        SELECT m.*, o.name as "orgName", o.id as "orgId" 
        FROM "Membership" m 
        JOIN "Organization" o ON m."organizationId" = o.id 
        WHERE m."userId" = $1
      `, [user.id]);
      
      const mappedMemberships = memberships.map(m => ({
          ...m,
          organization: { id: m.orgId, name: m.orgName }
      }));

      return { user, memberships: mappedMemberships };
    }),

  createOrg: publicProcedure
    .input(z.object({ clerkId: z.string(), name: z.string() }))
    .mutation(async ({ input }) => {
      const user = await getUserByClerkUserId(input.clerkId);
      if (!user) throw new Error("User not found");

      const orgId = randomUUID();
      await createOrganization(orgId, input.name);
      await createMembership(randomUUID(), user.id, orgId, 'ADMIN');

      return { id: orgId, name: input.name };
    })
});

export type AppRouter = typeof appRouter;