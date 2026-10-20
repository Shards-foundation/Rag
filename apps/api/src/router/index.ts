import { z } from "zod";
import { sourcesRouter } from "./sources";
import { teamRouter } from "./team";
import { chatRouter } from "./chat";
import { middleware, protectedProcedure, publicProcedure, router } from "./trpc";
import { query, getUserByClerkUserId, createUser, createOrganization, createMembership, User, Membership } from "@lumina/db";
import { randomUUID } from "crypto";

export { middleware, protectedProcedure, publicProcedure };

export const appRouter = router({
  health: publicProcedure.query(() => "ok"),
  sources: sourcesRouter,
  team: teamRouter,
  chat: chatRouter,
  
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