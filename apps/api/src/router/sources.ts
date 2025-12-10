import { Queue } from "bullmq";
import { env } from "@lumina/config";
import { z } from "zod";
import { query, createDataSource, createDocument, createAuditEvent, DataSource, Document } from "@lumina/db";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";

const ingestionQueue = new Queue("ingestion", {
  connection: { url: env.REDIS_URL }
});

const MAX_FILE_SIZE_B = 10 * 1024 * 1024; // 10MB

export const sourcesRouter = (t: any, protectedProcedure: any) => t.router({
  list: protectedProcedure.query(async ({ ctx }: any) => {
    const sql = `
      SELECT ds.*, 
      (SELECT COUNT(*) FROM "Document" d WHERE d."dataSourceId" = ds.id) as "docCount"
      FROM "DataSource" ds
      WHERE ds."organizationId" = $1
      ORDER BY ds."createdAt" DESC
    `;
    const { rows } = await query<DataSource & { docCount: string }>(sql, [ctx.organizationId]);
    return rows.map((r: any) => ({
      ...r,
      _count: { documents: parseInt(r.docCount || "0") }
    }));
  }),

  listDocuments: protectedProcedure
    .query(async ({ ctx }: any) => {
      const sql = `
        SELECT d.*, ds."displayName" as "sourceName"
        FROM "Document" d
        JOIN "DataSource" ds ON d."dataSourceId" = ds.id
        WHERE d."organizationId" = $1
        ORDER BY d."createdAt" DESC
        LIMIT 50
      `;
      const { rows } = await query<Document & { sourceName: string }>(sql, [ctx.organizationId]);
      return rows;
    }),

  upload: protectedProcedure
    .input(z.object({
      fileName: z.string(),
      contentBase64: z.string()
    }))
    .mutation(async ({ ctx, input }: any) => {
      const orgId = ctx.organizationId;

      if (!input.fileName.trim()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Filename required" });
      }
      
      const ext = input.fileName.split('.').pop()?.toLowerCase();
      if (!['txt', 'md', 'pdf'].includes(ext || '')) {
         throw new TRPCError({ code: "BAD_REQUEST", message: "Only .txt, .md, .pdf allowed" });
      }

      if (input.contentBase64.length > MAX_FILE_SIZE_B * 1.37) {
        throw new TRPCError({ code: "PAYLOAD_TOO_LARGE", message: "File too large (max 10MB)" });
      }

      let { rows: dsRows } = await query<DataSource>(
        `SELECT * FROM "DataSource" WHERE "organizationId" = $1 AND type = 'MANUAL_UPLOAD'`, 
        [orgId]
      );
      let ds = dsRows[0];

      if (!ds) {
        ds = await createDataSource({
          id: randomUUID(),
          organizationId: orgId,
          type: "MANUAL_UPLOAD",
          displayName: "Manual Uploads",
          status: "ACTIVE"
        });
      }

      const doc = await createDocument({
        id: randomUUID(),
        organizationId: orgId,
        dataSourceId: ds.id,
        title: input.fileName,
        mimeType: "text/plain",
        status: "PENDING"
      });

      await ingestionQueue.add("ingest-doc", {
        organizationId: orgId,
        documentId: doc.id,
        contentBase64: input.contentBase64 
      });

      await createAuditEvent({
        id: randomUUID(),
        organizationId: orgId,
        userId: ctx.userId,
        type: "DOCUMENT_UPLOAD",
        metadata: { documentId: doc.id, fileName: input.fileName }
      });

      return { id: doc.id };
    })
});