import { z } from "zod";
import { query, createChatSession, ChatSession, Message } from "@lumina/db";
import { randomUUID } from "crypto";

export const chatRouter = (t: any, protectedProcedure: any) => t.router({
  listSessions: protectedProcedure.query(async ({ ctx }: any) => {
    const { rows } = await query<ChatSession>(
      `SELECT * FROM "ChatSession" WHERE "organizationId" = $1 AND "userId" = $2 ORDER BY "updatedAt" DESC`,
      [ctx.organizationId, ctx.userId]
    );
    return rows;
  }),

  createSession: protectedProcedure.mutation(async ({ ctx }: any) => {
    const s = await createChatSession({
      id: randomUUID(),
      organizationId: ctx.organizationId,
      userId: ctx.userId,
      title: "New Chat"
    });
    return { id: s.id };
  }),
  
  getHistory: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }: any) => {
      const { rows: sessions } = await query<ChatSession>(
        `SELECT * FROM "ChatSession" WHERE id = $1 AND "organizationId" = $2`,
        [input.sessionId, ctx.organizationId]
      );
      if (!sessions.length) throw new Error("Not found");

      const { rows: messages } = await query<Message>(
        `SELECT * FROM "Message" WHERE "chatSessionId" = $1 ORDER BY "createdAt" ASC`,
        [input.sessionId]
      );
      return messages;
    })
});