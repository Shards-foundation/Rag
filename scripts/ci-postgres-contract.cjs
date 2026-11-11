/* Ephemeral CI-only PostgreSQL contract. Never point this script at production. */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const pg = require("pg");

const action = process.argv[2];
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required.");

async function main() {
  const db = new pg.Client({ connectionString });
  await db.connect();
  try {
    if (action === "create-legacy-db") {
      await db.query("CREATE DATABASE lumina_legacy");
      console.log("Created isolated legacy fixture database.");
      return;
    }
    if (action === "prepare-legacy") {
      await db.query(`CREATE TABLE IF NOT EXISTS "_Migration" (
        "name" TEXT PRIMARY KEY, "appliedAt" TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )`);
      const sql = fs.readFileSync(path.resolve(__dirname, "../packages/db/migrations/001_core.sql"), "utf8");
      await db.query(sql);
      await db.query(`INSERT INTO "_Migration" ("name") VALUES ('001_core.sql')`);
      await db.query(`INSERT INTO "Organization" (id, name) VALUES ('legacy-org', 'Existing workspace')`);
      await db.query(`INSERT INTO "DataSource" (id, "organizationId", type, "displayName")
        VALUES ('legacy-source', 'legacy-org', 'MANUAL_UPLOAD', 'Existing source')`);
      await db.query(`INSERT INTO "Document" (id, "organizationId", "dataSourceId", title, "mimeType", status)
        VALUES ('legacy-document', 'legacy-org', 'legacy-source', 'Original', 'text/plain', 'ACTIVE')`);
      await db.query(`INSERT INTO "DocumentChunk" (id, "documentId", "organizationId", "index", content, embedding)
        VALUES ('legacy-chunk', 'legacy-document', 'legacy-org', 0, 'Original text', '[1,0]'::jsonb)`);
      console.log("Seeded legacy data before migration.");
      return;
    }
    if (action !== "verify-fresh" && action !== "verify-legacy") {
      throw new Error("Expected create-legacy-db, prepare-legacy, verify-fresh, or verify-legacy.");
    }

    const expected = [
      "Membership_userId_fkey", "Membership_organizationId_fkey",
      "DataSource_organizationId_fkey", "Document_organizationId_fkey",
      "DocumentChunk_documentId_organizationId_fkey",
      "ChatSession_organizationId_fkey", "ChatSession_userId_fkey",
      "Message_chatSessionId_fkey",
    ];
    const constraints = (await db.query(
      "SELECT conname, convalidated FROM pg_constraint WHERE conname = ANY($1::text[])",
      [expected],
    )).rows;
    for (const name of expected) {
      const match = constraints.find((item) => item.conname === name);
      assert.ok(match, `Missing foreign key: ${name}`);
      assert.equal(match.convalidated, true, `Unvalidated foreign key: ${name}`);
    }

    const idx = (await db.query(`SELECT 1 FROM pg_indexes
      WHERE tablename='DocumentChunk' AND indexname='DocumentChunk_org_document_index_idx'`)).rows;
    assert.equal(idx.length, 1, "Tenant cursor index not present");

    await db.query(`INSERT INTO "Organization" (id, name)
      VALUES ('ci-org-a', 'CI A'), ('ci-org-b', 'CI B')`);
    await db.query(`INSERT INTO "DataSource" (id, "organizationId", type, "displayName")
      VALUES ('ci-source-a', 'ci-org-a', 'MANUAL_UPLOAD', 'CI test')`);
    await db.query(`INSERT INTO "Document" (id, "organizationId", "dataSourceId", title, "mimeType", status)
      VALUES ('ci-doc-a', 'ci-org-a', 'ci-source-a', 'A', 'text/plain', 'ACTIVE')`);
    await db.query(`INSERT INTO "DocumentChunk" (id, "documentId", "organizationId", "index", content, embedding)
      VALUES
        ('ci-chunk-0', 'ci-doc-a', 'ci-org-a', 0, 'First', '[1,0]'::jsonb),
        ('ci-chunk-1', 'ci-doc-a', 'ci-org-a', 1, 'Second', '[0,1]'::jsonb)`);

    // A guessed cross-organization document identifier cannot create a chunk.
    let blocked = false;
    try {
      await db.query(`INSERT INTO "DocumentChunk"
        (id, "documentId", "organizationId", "index", content, embedding)
        VALUES ('cross-tenant', 'ci-doc-a', 'ci-org-b', 2, 'Forbidden', '[1,0]'::jsonb)`);
    } catch (error) {
      assert.equal(error.code, "23503", "Cross-tenant insert must violate its foreign key");
      blocked = true;
    }
    assert.ok(blocked, "Cross-tenant insert unexpectedly succeeded");
  } finally {
    await db.end();
  }

  // Use the actual compiled repository helper, not hand-rolled SQL, to check
  // keyset pagination and tenant isolation against a real PostgreSQL server.
  const { listOrganizationChunkPage, pool } = require("@lumina/db");
  try {
    const first = await listOrganizationChunkPage("ci-org-a", null, 1);
    assert.equal(first.length, 1);
    assert.equal(first[0].content, "First");
    const next = await listOrganizationChunkPage(
      "ci-org-a", { documentId: first[0].documentId, index: first[0].index }, 1,
    );
    assert.equal(next.length, 1);
    assert.equal(next[0].content, "Second");
    const other = await listOrganizationChunkPage("ci-org-b", null, 1);
    assert.equal(other.length, 0, "Tenant B can see tenant A's chunks");

    if (action === "verify-legacy") {
      const retained = await listOrganizationChunkPage("legacy-org", null, 5);
      assert.equal(retained.length, 1);
      assert.equal(retained[0].content, "Original text");
    }
    console.log(`PostgreSQL ${action}: migrations, constraints, cursor index and tenant isolation PASS.`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("PostgreSQL contract FAILED:", error);
  process.exitCode = 1;
});
