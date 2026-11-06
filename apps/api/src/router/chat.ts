import { z } from "zod";
import { createChatSession, getChatSessionForUser, query } from "@lumina/db";
import type { ChatSession, Message } from "@lumina/db";
import { randomUUID } from "node:crypto";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./trpc";

export const chatRouter = router({
  listSessions: protectedProcedure.query(async ({ ctx }) => {
    const { rows } = await query<ChatSession>(
      `SELECT * FROM "ChatSession" WHERE "organizationId" = $1 AND "userId" = $2 ORDER BY "updatedAt" DESC LIMIT 100`,
      [ctx.organizationId, ctx.userId],
    );
    return rows;
  }),

  createSession: protectedProcedure.mutation(async ({ ctx }) => {
    const session = await createChatSession({
      id: randomUUID(),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      title: "New Chat",
    });
    return { id: session.id, title: session.title };
  }),

  getHistory: protectedProcedure
    .input(z.object({ sessionId: z.string().uuid() }))
    .query(async ({ ctx, input }) => {
      const session = await getChatSessionForUser(input.sessionId, ctx.organizationId, ctx.userId);
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Chat session not found." });
      const { rows } = await query<Message>(
        `SELECT * FROM "Message" WHERE "chatSessionId" = $1 ORDER BY "createdAt" ASC LIMIT 500`,
        [session.id],
      );
      return rows;
    }),
});
