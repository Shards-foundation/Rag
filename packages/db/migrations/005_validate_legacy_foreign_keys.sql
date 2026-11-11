-- Enforce constraints introduced as NOT VALID by the legacy-safe migration.
-- Existing orphaned rows MUST be repaired before this migration can complete;
-- failing the migration is intentional, not a reason to bypass validation.
-- Schedule during maintenance on populated databases: validation scans tables.
ALTER TABLE "Membership" VALIDATE CONSTRAINT "Membership_userId_fkey";
ALTER TABLE "Membership" VALIDATE CONSTRAINT "Membership_organizationId_fkey";
ALTER TABLE "DataSource" VALIDATE CONSTRAINT "DataSource_organizationId_fkey";
ALTER TABLE "Document" VALIDATE CONSTRAINT "Document_organizationId_fkey";
ALTER TABLE "DocumentChunk" VALIDATE CONSTRAINT "DocumentChunk_documentId_organizationId_fkey";
ALTER TABLE "ChatSession" VALIDATE CONSTRAINT "ChatSession_organizationId_fkey";
ALTER TABLE "ChatSession" VALIDATE CONSTRAINT "ChatSession_userId_fkey";
ALTER TABLE "Message" VALIDATE CONSTRAINT "Message_chatSessionId_fkey";
