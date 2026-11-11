import { listOrganizationChunkPage, type OrganizationChunkCursor } from "@lumina/db";
import { rankChunks, type RankedChunk } from "@lumina/ai";
import { CONSTANTS } from "@lumina/config";

const PAGE_SIZE = 128;
const MAX_SCAN_CHUNKS = 2_048;

export class RetrievalCapacityError extends Error {
  constructor() {
    super("Workspace corpus exceeds the safe JSON-embedding scan limit. Configure indexed vector search before querying this corpus.");
    this.name = "RetrievalCapacityError";
  }
}

/**
 * Exact top-k cosine search over a bounded corpus, without loading every
 * workspace embedding into API memory simultaneously. This is a temporary
 * safe fallback, not a replacement for pgvector/HNSW for larger datasets.
 * A corpus over MAX_SCAN_CHUNKS fails explicitly rather than returning
 * incomplete or misleading citations.
 */
export async function retrieveOrganizationPassages(
  organizationId: string,
  queryEmbedding: number[],
  topK = CONSTANTS.DEFAULT_TOP_K,
): Promise<RankedChunk[]> {
  if (!organizationId) throw new TypeError("An authenticated organization is required.");
  if (!Number.isInteger(topK) || topK < 1 || topK > 20) {
    throw new RangeError("topK must be between 1 and 20.");
  }
  if (!Array.isArray(queryEmbedding) || !queryEmbedding.length || !queryEmbedding.every(Number.isFinite)) {
    throw new TypeError("A finite query embedding is required.");
  }
  let cursor: OrganizationChunkCursor | null = null;
  let scanned = 0;
  let ranked: RankedChunk[] = [];

  while (scanned < MAX_SCAN_CHUNKS) {
    const batch = await listOrganizationChunkPage(organizationId, cursor, PAGE_SIZE);
    if (batch.length === 0) return ranked;

    ranked = rankChunks(queryEmbedding, [...ranked, ...batch], topK);
    scanned += batch.length;
    const last = batch[batch.length - 1];
    cursor = { documentId: last.documentId, index: last.index };
    if (batch.length < PAGE_SIZE) return ranked;
  }

  // Check for an additional row: at exactly the safe limit, retrieval is
  // complete only if no more rows exist. Never silently truncate a corpus.
  if ((await listOrganizationChunkPage(organizationId, cursor, 1)).length > 0) {
    throw new RetrievalCapacityError();
  }
  return ranked;
}
