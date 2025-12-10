import { query, createMessage, Message } from "@lumina/db";
import { vectorStore, generateAnswerStream, embedText } from "@lumina/ai";
import { CONSTANTS } from "@lumina/config";
import { randomUUID } from "crypto";
import { z } from "zod";

const chatStreamSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().min(1).max(4000),
  organizationId: z.string().min(1),
  userId: z.string().min(1),
});

export async function chatStreamHandler(req: any, reply: any) {
  const parseResult = chatStreamSchema.safeParse(req.body);
  
  if (!parseResult.success) {
    reply.code(400).send({
      success: false,
      error: {
        code: "VALIDATION_ERROR",
        message: "Invalid request body",
        details: parseResult.error.flatten()
      }
    });
    return;
  }

  const { sessionId, message, organizationId, userId } = parseResult.data;

  try {
    const memberCheck = await query(
      `SELECT 1 FROM "Membership" WHERE "userId" = $1 AND "organizationId" = $2`,
      [userId, organizationId]
    );
    if (memberCheck.rows.length === 0) {
      reply.code(403).send({ success: false, error: { code: "FORBIDDEN", message: "User not in organization" } });
      return;
    }

    await createMessage({
      id: randomUUID(),
      chatSessionId: sessionId,
      role: "USER",
      content: message
    });

    const embedding = await embedText(message);
    const contextChunks = await vectorStore.query(embedding, CONSTANTS.DEFAULT_TOP_K, { organizationId });

    if (contextChunks.length === 0) {
      console.warn(`[Chat] No context found for org ${organizationId}`);
    }

    const { rows: history } = await query<Message>(
      `SELECT * FROM "Message" WHERE "chatSessionId" = $1 ORDER BY "createdAt" ASC LIMIT 20`,
      [sessionId]
    );

    const historyFormatted = history.map((h) => ({
      role: h.role === 'USER' ? 'user' : 'assistant' as const,
      content: h.content
    }));

    reply.raw.setHeader("Content-Type", "text/event-stream");
    reply.raw.setHeader("Cache-Control", "no-cache");
    reply.raw.setHeader("Connection", "keep-alive");

    let fullResponse = "";

    const generator = generateAnswerStream(message, contextChunks, historyFormatted);
    
    for await (const token of generator) {
      reply.raw.write(token);
      fullResponse += token;
    }

    await createMessage({
      id: randomUUID(),
      chatSessionId: sessionId,
      role: "ASSISTANT",
      content: fullResponse
    });
    
    reply.raw.end();

  } catch (e: any) {
    console.error("[Chat Stream Error]", e);
    if (!reply.raw.headersSent) {
      reply.code(500).send({ success: false, error: { code: "INTERNAL_SERVER_ERROR", message: "Processing failed" } });
    } else {
      reply.raw.write("\n[System Error: Response interrupted]");
      reply.raw.end();
    }
  }
}