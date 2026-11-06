ALTER TABLE "DocumentChunk" ADD COLUMN IF NOT EXISTS "embedding" JSONB;
ALTER TABLE "Document" ADD COLUMN IF NOT EXISTS "size" INTEGER;

-- The previous bootstrap created Document.id as a primary key but did not
-- create this composite key, which the tenant-safe chunk foreign key needs.
CREATE UNIQUE INDEX IF NOT EXISTS "Document_id_organizationId_key"
  ON "Document" ("id", "organizationId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_userId_fkey') THEN
    ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Membership_organizationId_fkey') THEN
    ALTER TABLE "Membership" ADD CONSTRAINT "Membership_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DataSource_organizationId_fkey') THEN
    ALTER TABLE "DataSource" ADD CONSTRAINT "DataSource_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Document_organizationId_fkey') THEN
    ALTER TABLE "Document" ADD CONSTRAINT "Document_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'DocumentChunk_documentId_organizationId_fkey') THEN
    ALTER TABLE "DocumentChunk" ADD CONSTRAINT "DocumentChunk_documentId_organizationId_fkey" FOREIGN KEY ("documentId", "organizationId") REFERENCES "Document"("id", "organizationId") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatSession_organizationId_fkey') THEN
    ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "Organization"("id") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'ChatSession_userId_fkey') THEN
    ALTER TABLE "ChatSession" ADD CONSTRAINT "ChatSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE NOT VALID;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'Message_chatSessionId_fkey') THEN
    ALTER TABLE "Message" ADD CONSTRAINT "Message_chatSessionId_fkey" FOREIGN KEY ("chatSessionId") REFERENCES "ChatSession"("id") ON DELETE CASCADE NOT VALID;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS "Document_organization_status_idx" ON "Document" ("organizationId", "status");
CREATE INDEX IF NOT EXISTS "DocumentChunk_organization_idx" ON "DocumentChunk" ("organizationId");
CREATE INDEX IF NOT EXISTS "ChatSession_user_org_updated_idx" ON "ChatSession" ("userId", "organizationId", "updatedAt" DESC);
CREATE INDEX IF NOT EXISTS "Message_session_created_idx" ON "Message" ("chatSessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AuditEvent_org_created_idx" ON "AuditEvent" ("organizationId", "createdAt" DESC);
