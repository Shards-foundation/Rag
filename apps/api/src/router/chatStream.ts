import { createMessage, getChatSessionForUser, query } from "@lumina/db";
import type { Message } from "@lumina/db";
import { embedText, generateAnswerStream } from "@lumina/ai";
import { env } from "@lumina/config";
import { RetrievalCapacityError, retrieveOrganizationPassages } from "./retrieval";
import { enforceUserRateLimit } from "./rateLimit";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { requireOrganizationMembership, verifyRequestIdentity } from "./context";

const chatStreamSchema = z.object({
  sessionId: z.string().uuid(),
  message: z.string().trim().min(1).max(4_000),
}).strict();

type ChatStreamEvent = "sources" | "token" | "done" | "error";

function sendEvent(response: NodeJS.WritableStream, event: ChatStreamEvent, data: unknown): void {
  response.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
}

export async function chatStreamHandler(req: any, reply: any): Promise<void> {
  const parsed = chatStreamSchema.safeParse(req.body);
  if (!parsed.success) {
    reply.code(400).send({ error: "Invalid chat request", details: parsed.error.flatten().fieldErrors });
    return;
  }

  const identity = await verifyRequestIdentity(req.headers.authorization);
  if (!identity) {
    reply.code(401).send({ error: "Sign in to chat." });
    return;
  }
  const orgHeader = req.headers["x-org-id"];
  const organizationId = typeof orgHeader === "string" && orgHeader.trim() ? orgHeader.trim() : undefined;
  if (!organizationId) {
    reply.code(400).send({ error: "Select an organization first." });
    return;
  }

  try {
    await requireOrganizationMembership(identity.userId, organizationId);
  } catch (error) {
    // An unavailable database is not proof of revoked membership; surface
    // infrastructure errors as 5xx rather than disguising them as HTTP 403.
    if (error instanceof TRPCError && error.code === "FORBIDDEN") {
      reply.code(403).send({ error: "You do not have access to this organization." });
      return;
    }
    throw error;
  }

  const { sessionId, message } = parsed.data;
  const session = await getChatSessionForUser(sessionId, organizationId, identity.userId);
  if (!session) {
    reply.code(404).send({ error: "Chat session not found." });
    return;
  }

  try {
    await enforceUserRateLimit("chat", identity.userId);
  } catch (error) {
    if (error instanceof TRPCError && error.code === "TOO_MANY_REQUESTS") {
      reply.code(429).header("Retry-After", "60").send({ error: error.message });
      return;
    }
    throw error;
  }

  const { rows: previousMessages } = await query<Message>(
    `SELECT * FROM (SELECT * FROM "Message" WHERE "chatSessionId" = $1 ORDER BY "createdAt" DESC LIMIT 20) recent ORDER BY "createdAt" ASC`,
    [sessionId],
  );
  await createMessage({ id: randomUUID(), chatSessionId: sessionId, role: "USER", content: message });

  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableEnded) controller.abort();
  });

  try {
    const queryVector = await embedText(message);
    const ranked = await retrieveOrganizationPassages(organizationId, queryVector);
    const citationMetadata = ranked.map(({ documentId, documentTitle, index, score, content }) => ({
      documentId, title: documentTitle, chunkIndex: index, score: Number(score.toFixed(4)), excerpt: content.slice(0, 800),
    }));
    const sources = ranked.map(({ id, documentId, documentTitle, index, score, content }) => ({
      id, documentId, title: documentTitle, chunkIndex: index, score: Number(score.toFixed(4)), excerpt: content.slice(0, 800),
    }));
    const history = previousMessages.map((item) => ({
      role: item.role === "USER" ? "user" as const : "assistant" as const,
      content: item.content,
    }));

    reply.hijack();
    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
      "Access-Control-Allow-Origin": env.WEB_URL,
      "Access-Control-Allow-Credentials": "true",
      "Vary": "Origin",
    });
    reply.raw.flushHeaders();
    sendEvent(reply.raw, "sources", { sources });

    let answer = "";
    if (ranked.length === 0) {
      answer = "I couldn't find relevant passages in the indexed documents. Add or index a document, then try again.";
      sendEvent(reply.raw, "token", { text: answer });
    } else {
      for await (const token of generateAnswerStream(
        message,
        ranked.map((item) => ({ content: item.content, title: item.documentTitle })),
        history,
        controller.signal,
      )) {
        answer += token;
        sendEvent(reply.raw, "token", { text: token });
      }
    }

    if (!controller.signal.aborted && answer) {
      await createMessage({ id: randomUUID(), chatSessionId: sessionId, role: "ASSISTANT", content: answer, sources: citationMetadata });
      sendEvent(reply.raw, "done", {});
    }
    if (!reply.raw.writableEnded) reply.raw.end();
  } catch (error) {
    console.error("Chat answer failed", error instanceof Error ? error.name : "unknown error");
    if (reply.raw.headersSent) {
      if (!controller.signal.aborted) sendEvent(reply.raw, "error", { message: "The answer could not be completed. Please try again." });
      if (!reply.raw.writableEnded) reply.raw.end();
      return;
    }
    if (error instanceof RetrievalCapacityError) {
      reply.code(503).send({ error: "The indexed corpus exceeds the safe retrieval limit. Database-native vector search is required for this workspace." });
      return;
    }
    const status = error instanceof Error && error.message.includes("OPENAI_API_KEY") ? 503 : 500;
    reply.code(status).send({ error: status === 503 ? "AI provider is not configured." : "Unable to answer this request." });
  }
}
