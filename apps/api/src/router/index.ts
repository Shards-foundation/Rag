import { z } from "zod";
import { sourcesRouter } from "./sources";
import { teamRouter } from "./team";
import { chatRouter } from "./chat";
import { authenticatedProcedure, middleware, protectedProcedure, publicProcedure, router } from "./trpc";
import { createOrganizationForUser, getUserById, listMembershipsForUser } from "@lumina/db";
import { randomUUID } from "node:crypto";

export { middleware, authenticatedProcedure, protectedProcedure, publicProcedure };

export const appRouter = router({
  health: publicProcedure.query(() => "ok"),
  sources: sourcesRouter,
  team: teamRouter,
  chat: chatRouter,

  me: authenticatedProcedure.query(async ({ ctx }) => {
    const user = await getUserById(ctx.userId);
    if (!user) throw new Error("Authenticated user record is unavailable.");
    const memberships = await listMembershipsForUser(user.id);
    return { user, memberships };
  }),

  createOrg: authenticatedProcedure
    .input(z.object({ name: z.string().trim().min(2).max(80) }))
    .mutation(async ({ ctx, input }) => {
      const organization = await createOrganizationForUser(randomUUID(), input.name, ctx.userId);
      return { id: organization.id, name: organization.name };
    }),
});

export type AppRouter = typeof appRouter;
