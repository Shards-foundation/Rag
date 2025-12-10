import { Worker } from "bullmq";
import { updateDocumentStatus, createDocumentChunk, createAuditEvent } from "@lumina/db";
import { env, CONSTANTS } from "@lumina/config";
import { embedText, vectorStore, chunkText } from "@lumina/ai";
import { Buffer } from "buffer";
import { randomUUID } from "crypto";

console.log("Worker starting...");

const worker = new Worker("ingestion", async (job) => {
  const { organizationId, documentId, contentBase64 } = job.data;
  console.log(`Processing doc ${documentId} for org ${organizationId}`);

  try {
    await updateDocumentStatus(documentId, "INDEXING");

    const content = Buffer.from(contentBase64, 'base64').toString('utf-8');
    const chunks = chunkText(content, CONSTANTS.CHUNK_SIZE_CHARS, CONSTANTS.CHUNK_OVERLAP_CHARS);

    const vectorChunks = [];
    let idx = 0;
    
    for (const chunkTextVal of chunks) {
      const embedding = await embedText(chunkTextVal);
      const chunkId = randomUUID();
      const embeddingRef = `vec_${documentId}_${idx}`;

      await createDocumentChunk({
        id: chunkId,
        documentId,
        organizationId,
        index: idx,
        content: chunkTextVal,
        embeddingRef
      });

      vectorChunks.push({
        id: chunkId,
        vector: embedding,
        metadata: {
          documentId,
          organizationId,
          content: chunkTextVal
        }
      });
      idx++;
    }

    await vectorStore.upsertMany(vectorChunks);
    await updateDocumentStatus(documentId, "ACTIVE");
    
    await createAuditEvent({
        id: randomUUID(),
        organizationId,
        type: "DOCUMENT_PROCESSED",
        metadata: { documentId, chunkCount: idx }
    });
    
    console.log(`Done processing ${documentId}. Indexed ${idx} chunks.`);

  } catch (e) {
    console.error("Job failed", e);
    await updateDocumentStatus(documentId, "ERROR");
    throw e;
  }

}, { connection: { url: env.REDIS_URL } });

worker.on('completed', job => {
  console.log(`${job.id} has completed!`);
});

worker.on('failed', (job, err) => {
  console.log(`${job?.id} has failed with ${err.message}`);
});