-- Supports bounded tenant-scoped keyset retrieval in
-- listOrganizationChunkPage(organizationId, cursor, limit).
-- Build offline during a maintenance window for larger populated tables:
-- this migration is transactional and CREATE INDEX can block concurrent writes.
CREATE INDEX IF NOT EXISTS "DocumentChunk_org_document_index_idx"
  ON "DocumentChunk" ("organizationId", "documentId", "index");
