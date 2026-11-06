import { pool, query } from "./client";
import type {
  Organization,
  User,
  Membership,
  DataSource,
  Document,
  DocumentChunk,
  ChatSession,
  Message,
  AuditEvent,
} from "./schema";

export * from "./schema";
export { pool, query };

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const { rows } = await query<Organization>(`SELECT * FROM "Organization" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getUserByClerkUserId(clerkId: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT * FROM "User" WHERE "clerkUserId" = $1`, [clerkId]);
  return rows[0] ?? null;
}

export async function getUserById(id: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT * FROM "User" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function upsertUser(clerkId: string, email: string, name: string | null): Promise<User> {
  const { rows } = await query<User>(
    `INSERT INTO "User" (id, "clerkUserId", email, name)
     VALUES (gen_random_uuid()::text, $1, $2, $3)
     ON CONFLICT ("clerkUserId") DO UPDATE
       SET email = EXCLUDED.email, name = EXCLUDED.name, "updatedAt" = NOW()
     RETURNING *`,
    [clerkId, email, name],
  );
  return rows[0];
}

export async function listMembershipsForUser(userId: string) {
  const { rows } = await query<Membership & { organizationName: string }>(
    `SELECT m.*, o.name AS "organizationName"
     FROM "Membership" m JOIN "Organization" o ON o.id = m."organizationId"
     WHERE m."userId" = $1 ORDER BY o.name`,
    [userId],
  );
  return rows;
}

export async function getMembershipForUserInOrg(userId: string, organizationId: string): Promise<Membership | null> {
  const { rows } = await query<Membership>(
    `SELECT * FROM "Membership" WHERE "userId" = $1 AND "organizationId" = $2`,
    [userId, organizationId],
  );
  return rows[0] ?? null;
}

export async function createOrganization(id: string, name: string): Promise<Organization> {
  const { rows } = await query<Organization>(
    `INSERT INTO "Organization" (id, name) VALUES ($1, $2) RETURNING *`,
    [id, name],
  );
  return rows[0];
}

export async function createOrganizationForUser(id: string, name: string, userId: string): Promise<Organization> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const { rows } = await client.query<Organization>(
      `INSERT INTO "Organization" (id, name) VALUES ($1, $2) RETURNING *`,
      [id, name],
    );
    await client.query(
      `INSERT INTO "Membership" (id, "userId", "organizationId", role)
       VALUES (gen_random_uuid()::text, $1, $2, 'ADMIN')`,
      [userId, id],
    );
    await client.query("COMMIT");
    return rows[0];
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function createUser(id: string, clerkId: string, email: string, name?: string): Promise<User> {
  const { rows } = await query<User>(
    `INSERT INTO "User" (id, "clerkUserId", email, name) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, clerkId, email, name || null],
  );
  return rows[0];
}

export async function createMembership(id: string, userId: string, orgId: string, role: string): Promise<Membership> {
  const { rows } = await query<Membership>(
    `INSERT INTO "Membership" (id, "userId", "organizationId", role) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, userId, orgId, role],
  );
  return rows[0];
}

export async function createDataSource(ds: Partial<DataSource>): Promise<DataSource> {
  const { rows } = await query<DataSource>(
    `INSERT INTO "DataSource" (id, "organizationId", type, "displayName", status)
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [ds.id, ds.organizationId, ds.type, ds.displayName, ds.status],
  );
  return rows[0];
}

export async function createDocument(doc: Partial<Document>): Promise<Document> {
  const { rows } = await query<Document>(
    `INSERT INTO "Document" (id, "organizationId", "dataSourceId", title, "mimeType", size, status)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [doc.id, doc.organizationId, doc.dataSourceId, doc.title, doc.mimeType, doc.size ?? null, doc.status],
  );
  return rows[0];
}

export async function getDocumentForOrganization(id: string, organizationId: string): Promise<Document | null> {
  const { rows } = await query<Document>(
    `SELECT * FROM "Document" WHERE id = $1 AND "organizationId" = $2`,
    [id, organizationId],
  );
  return rows[0] ?? null;
}

export async function updateDocumentStatus(id: string, organizationId: string, status: string): Promise<void> {
  await query(
    `UPDATE "Document" SET status = $1, "updatedAt" = NOW() WHERE id = $2 AND "organizationId" = $3`,
    [status, id, organizationId],
  );
}

export async function deleteDocumentForOrganization(id: string, organizationId: string): Promise<void> {
  await query(`DELETE FROM "Document" WHERE id = $1 AND "organizationId" = $2`, [id, organizationId]);
}

export async function replaceDocumentChunks(
  documentId: string,
  organizationId: string,
  chunks: Array<Omit<DocumentChunk, "createdAt">>,
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const doc = await client.query(
      `SELECT 1 FROM "Document" WHERE id = $1 AND "organizationId" = $2 FOR UPDATE`,
      [documentId, organizationId],
    );
    if (doc.rowCount !== 1) throw new Error("Document ownership changed or document was deleted");
    await client.query(
      `DELETE FROM "DocumentChunk" WHERE "documentId" = $1 AND "organizationId" = $2`,
      [documentId, organizationId],
    );
    for (const chunk of chunks) {
      await client.query(
        `INSERT INTO "DocumentChunk" (id, "documentId", "organizationId", index, content, "embeddingRef", embedding)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb)`,
        [chunk.id, documentId, organizationId, chunk.index, chunk.content, chunk.embeddingRef, JSON.stringify(chunk.embedding)],
      );
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
}

export async function listOrganizationChunks(organizationId: string) {
  const { rows } = await query<DocumentChunk & { documentTitle: string }>(
    `SELECT c.*, d.title AS "documentTitle"
     FROM "DocumentChunk" c
     JOIN "Document" d ON d.id = c."documentId" AND d."organizationId" = c."organizationId"
     WHERE c."organizationId" = $1 AND d.status = 'ACTIVE'
     ORDER BY c."documentId", c.index`,
    [organizationId],
  );
  return rows;
}

export async function createChatSession(session: Partial<ChatSession>): Promise<ChatSession> {
  const { rows } = await query<ChatSession>(
    `INSERT INTO "ChatSession" (id, "organizationId", "userId", title)
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [session.id, session.organizationId, session.userId, session.title],
  );
  return rows[0];
}

export async function getChatSessionForUser(
  sessionId: string,
  organizationId: string,
  userId: string,
): Promise<ChatSession | null> {
  const { rows } = await query<ChatSession>(
    `SELECT * FROM "ChatSession" WHERE id = $1 AND "organizationId" = $2 AND "userId" = $3`,
    [sessionId, organizationId, userId],
  );
  return rows[0] ?? null;
}

export async function createMessage(msg: Partial<Message>): Promise<Message> {
  const { rows } = await query<Message>(
    `INSERT INTO "Message" (id, "chatSessionId", role, content, sources)
     VALUES ($1, $2, $3, $4, $5::jsonb) RETURNING *`,
    [msg.id, msg.chatSessionId, msg.role, msg.content, JSON.stringify(msg.sources ?? null)],
  );
  await query(
    `UPDATE "ChatSession" SET "updatedAt" = NOW(),
       title = CASE WHEN title = 'New Chat' AND $2 = 'USER' THEN LEFT($3, 60) ELSE title END
     WHERE id = $1`,
    [msg.chatSessionId, msg.role, msg.content],
  );
  return rows[0];
}

export async function createAuditEvent(event: Partial<AuditEvent>): Promise<void> {
  await query(
    `INSERT INTO "AuditEvent" (id, "organizationId", "userId", type, metadata)
     VALUES ($1, $2, $3, $4, $5)`,
    [event.id, event.organizationId, event.userId, event.type, event.metadata],
  );
}
