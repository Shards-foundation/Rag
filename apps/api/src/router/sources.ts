import { Queue } from "bullmq";
import Redis from "ioredis";
import { env, CONSTANTS } from "@lumina/config";
import { z } from "zod";
import { query, createDataSource, createDocument, createAuditEvent, deleteDocumentForOrganization, updateDocumentStatus } from "@lumina/db";
import type { DataSource, Document } from "@lumina/db";
import { randomUUID } from "node:crypto";
import { mkdir, unlink, writeFile } from "node:fs/promises";
import path from "node:path";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./trpc";

const redisUrl = new URL(env.REDIS_URL);
const ingestionQueue = new Queue("ingestion", {
  connection: {
    host: redisUrl.hostname,
    port: Number(redisUrl.port || (redisUrl.protocol === "rediss:" ? 6380 : 6379)),
    ...(redisUrl.username ? { username: decodeURIComponent(redisUrl.username) } : {}),
    ...(redisUrl.password ? { password: decodeURIComponent(redisUrl.password) } : {}),
    ...(redisUrl.pathname.length > 1 ? { db: Number(redisUrl.pathname.slice(1)) } : {}),
    ...(redisUrl.protocol === "rediss:" ? { tls: {} } : {}),
  },
});
const healthRedis = new Redis(env.REDIS_URL, {
  lazyConnect: true,
  connectTimeout: 3_000,
  maxRetriesPerRequest: 1,
  retryStrategy: () => null,
});

export async function checkIngestionQueueHealth(): Promise<void> {
  if (healthRedis.status === "wait" || healthRedis.status === "end") await healthRedis.connect();
  if (await healthRedis.ping() !== "PONG") throw new Error("Redis health check failed.");
}

export async function closeIngestionQueue(): Promise<void> {
  if (healthRedis.status === "ready") await healthRedis.quit();
  else healthRedis.disconnect();
  await ingestionQueue.close();
}

const supportedTypes: Record<string, string> = {
  txt: "text/plain",
  md: "text/markdown",
  pdf: "application/pdf",
};
const maxBase64Chars = Math.ceil(CONSTANTS.MAX_UPLOAD_BYTES * 4 / 3) + 4;
const base64Pattern = /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/;
const uploadInput = z.object({
  fileName: z.string().trim().min(1).max(255),
  contentBase64: z.string().min(4).max(maxBase64Chars),
});

export const sourcesRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const { rows } = await query<DataSource & { docCount: string }>(
      `SELECT ds.*, (SELECT COUNT(*) FROM "Document" d WHERE d."dataSourceId" = ds.id AND d."organizationId" = ds."organizationId") AS "docCount"
       FROM "DataSource" ds WHERE ds."organizationId" = $1 ORDER BY ds."createdAt" DESC`,
      [ctx.organizationId],
    );
    return rows.map((row) => ({ ...row, _count: { documents: Number(row.docCount || 0) } }));
  }),

  listDocuments: protectedProcedure.query(async ({ ctx }) => {
    const { rows } = await query<Document & { sourceName: string }>(
      `SELECT d.*, ds."displayName" AS "sourceName"
       FROM "Document" d JOIN "DataSource" ds ON d."dataSourceId" = ds.id AND d."organizationId" = ds."organizationId"
       WHERE d."organizationId" = $1 ORDER BY d."createdAt" DESC LIMIT 100`,
      [ctx.organizationId],
    );
    return rows;
  }),

  upload: protectedProcedure.input(uploadInput).mutation(async ({ ctx, input }) => {
    const safeName = path.basename(input.fileName).replace(/[\u0000-\u001f\\/]/g, "_").trim();
    const extension = safeName.split(".").pop()?.toLowerCase() ?? "";
    const mimeType = supportedTypes[extension];
    if (!safeName || !mimeType) throw new TRPCError({ code: "BAD_REQUEST", message: "Only .txt, .md, and .pdf files are supported." });
    if (!base64Pattern.test(input.contentBase64)) throw new TRPCError({ code: "BAD_REQUEST", message: "File data is not valid base64." });

    const bytes = Buffer.from(input.contentBase64, "base64");
    if (bytes.byteLength === 0) throw new TRPCError({ code: "BAD_REQUEST", message: "The uploaded file is empty." });
    if (bytes.byteLength > CONSTANTS.MAX_UPLOAD_BYTES || bytes.toString("base64") !== input.contentBase64) {
      throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "Upload must be valid and no larger than 10 MB." });
    }

    const organizationId = ctx.organizationId;
    const { rows } = await query<DataSource>(
      `SELECT * FROM "DataSource" WHERE "organizationId" = $1 AND type = 'MANUAL_UPLOAD' ORDER BY "createdAt" ASC LIMIT 1`,
      [organizationId],
    );
    const dataSource = rows[0] ?? await createDataSource({
      id: randomUUID(), organizationId, type: "MANUAL_UPLOAD", displayName: "Uploaded documents", status: "ACTIVE",
    });

    const documentId = randomUUID();
    await mkdir(CONSTANTS.UPLOAD_DIR, { recursive: true });
    const storedFilePath = path.resolve(CONSTANTS.UPLOAD_DIR, `${documentId}.upload`);
    await writeFile(storedFilePath, bytes, { flag: "wx", mode: 0o600 });

    let documentCreated = false;
    try {
      const document = await createDocument({
        id: documentId,
        organizationId,
        dataSourceId: dataSource.id,
        title: safeName,
        mimeType,
        size: bytes.byteLength,
        status: "PENDING",
      });
      documentCreated = true;
      await ingestionQueue.add("ingest-document", { organizationId, documentId }, {
        jobId: documentId,
        attempts: 5,
        backoff: { type: "exponential", delay: 2_000 },
        removeOnComplete: { count: 1_000 },
        removeOnFail: { count: 5_000 },
      });
      void createAuditEvent({
        id: randomUUID(), organizationId, userId: ctx.userId, type: "DOCUMENT_UPLOAD",
        metadata: { documentId, fileName: safeName, size: bytes.byteLength },
      }).catch((error) => console.warn("Unable to record upload audit event", error instanceof Error ? error.message : "unknown error"));
      return { id: document.id, status: document.status };
    } catch (error) {
      if (documentCreated) {
        await deleteDocumentForOrganization(documentId, organizationId).catch(async (rollbackError) => {
          console.warn("Unable to remove a document after its ingestion job failed", rollbackError instanceof Error ? rollbackError.message : "unknown error");
          await updateDocumentStatus(documentId, organizationId, "ERROR").catch(() => undefined);
        });
      }
      await unlink(storedFilePath).catch(() => undefined);
      throw error;
    }
  }),
});
