import { Worker, type Job } from "bullmq";
import { createAuditEvent, getDocumentForOrganization, replaceDocumentChunks, updateDocumentStatus } from "@lumina/db";
import { env, CONSTANTS, requireEnvironment } from "@lumina/config";
import { chunkText, embedTexts } from "@lumina/ai";
import { PDFParse } from "pdf-parse";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";

function redisOptions() {
  const url = new URL(env.REDIS_URL);
  const database = url.pathname.length > 1 ? Number(url.pathname.slice(1)) : 0;
  return {
    host: url.hostname,
    port: Number(url.port || (url.protocol === "rediss:" ? 6380 : 6379)),
    ...(url.username ? { username: decodeURIComponent(url.username) } : {}),
    ...(url.password ? { password: decodeURIComponent(url.password) } : {}),
    ...(database ? { db: database } : {}),
    ...(url.protocol === "rediss:" ? { tls: {} } : {}),
    maxRetriesPerRequest: null as null,
  };
}

async function extractText(filePath: string, mimeType: string): Promise<string> {
  const buffer = await readFile(filePath);
  if (buffer.byteLength > CONSTANTS.MAX_UPLOAD_BYTES) throw new Error("Stored upload exceeds the configured size limit.");
  if (mimeType === "application/pdf") {
    const parser = new PDFParse({ data: buffer });
    try {
      const result = await parser.getText();
      if (result.text.length > 2_000_000) throw new Error("Extracted PDF text exceeds the 2,000,000 character limit.");
      return result.text;
    } finally {
      await parser.destroy();
    }
  }
  return buffer.toString("utf8").replace(/\u0000/g, "");
}

requireEnvironment("DATABASE_URL", "REDIS_URL", "OPENAI_API_KEY");

const worker = new Worker(
  "ingestion",
  async (job: Job<{ organizationId: string; documentId: string }>) => {
    const { organizationId, documentId } = job.data;
    const document = await getDocumentForOrganization(documentId, organizationId);
    if (!document) throw new Error("Document no longer exists in this organization.");

    try {
      await updateDocumentStatus(documentId, organizationId, "INDEXING");
      const filePath = path.resolve(CONSTANTS.UPLOAD_DIR, `${documentId}.upload`);
      const content = await extractText(filePath, document.mimeType);
      const parts = chunkText(content);
      if (parts.length === 0) throw new Error("No readable text was found in this document.");
      const embeddings = await embedTexts(parts);
      if (embeddings.length !== parts.length) throw new Error("Embedding provider returned an incomplete batch.");

      const chunks = parts.map((text, index) => ({
        id: randomUUID(),
        documentId,
        organizationId,
        index,
        content: text,
        embeddingRef: `text-embedding-3-small:${documentId}:${index}`,
        embedding: embeddings[index],
      }));
      await replaceDocumentChunks(documentId, organizationId, chunks);
      await updateDocumentStatus(documentId, organizationId, "ACTIVE");

      try {
        await createAuditEvent({
          id: randomUUID(),
          organizationId,
          type: "DOCUMENT_PROCESSED",
          metadata: { documentId, chunkCount: chunks.length },
        });
      } catch (auditError) {
        console.warn("Unable to write document-processing audit event", auditError instanceof Error ? auditError.message : "unknown error");
      }
      console.info(`Indexed ${documentId}: ${chunks.length} chunks.`);
    } catch (error) {
      const maxAttempts = Number(job.opts.attempts ?? 1);
      if (job.attemptsMade + 1 >= maxAttempts) {
        await updateDocumentStatus(documentId, organizationId, "ERROR");
      }
      throw error;
    }
  },
  { connection: redisOptions(), concurrency: 3 },
);

worker.on("completed", (job) => console.info(`Ingestion job ${job.id} completed.`));
worker.on("failed", (job, error) => console.error(`Ingestion job ${job?.id ?? "unknown"} failed:`, error.message));

async function shutdown(signal: string) {
  console.info(`Worker received ${signal}; closing queue connection.`);
  await worker.close();
  process.exit(0);
}
process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
