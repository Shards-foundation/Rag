import { query } from "./client";
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
export { query };

// --- CRUD Helpers ---

export async function getOrganizationById(id: string): Promise<Organization | null> {
  const { rows } = await query<Organization>(`SELECT * FROM "Organization" WHERE id = $1`, [id]);
  return rows[0] ?? null;
}

export async function getUserByClerkUserId(clerkId: string): Promise<User | null> {
  const { rows } = await query<User>(`SELECT * FROM "User" WHERE "clerkUserId" = $1`, [clerkId]);
  return rows[0] ?? null;
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
    [id, name]
  );
  return rows[0];
}

export async function createUser(id: string, clerkId: string, email: string, name?: string): Promise<User> {
  const { rows } = await query<User>(
    `INSERT INTO "User" (id, "clerkUserId", email, name) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, clerkId, email, name || null]
  );
  return rows[0];
}

export async function createMembership(id: string, userId: string, orgId: string, role: string): Promise<Membership> {
  const { rows } = await query<Membership>(
    `INSERT INTO "Membership" (id, "userId", "organizationId", role) VALUES ($1, $2, $3, $4) RETURNING *`,
    [id, userId, orgId, role]
  );
  return rows[0];
}

// Ingestion
export async function createDataSource(ds: Partial<DataSource>): Promise<DataSource> {
  const { rows } = await query<DataSource>(
    `INSERT INTO "DataSource" (id, "organizationId", type, "displayName", status) 
     VALUES ($1, $2, $3, $4, $5) RETURNING *`,
    [ds.id, ds.organizationId, ds.type, ds.displayName, ds.status]
  );
  return rows[0];
}

export async function createDocument(doc: Partial<Document>): Promise<Document> {
  const { rows } = await query<Document>(
    `INSERT INTO "Document" (id, "organizationId", "dataSourceId", title, "mimeType", status) 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [doc.id, doc.organizationId, doc.dataSourceId, doc.title, doc.mimeType, doc.status]
  );
  return rows[0];
}

export async function updateDocumentStatus(id: string, status: string): Promise<void> {
  await query(`UPDATE "Document" SET status = $1, "updatedAt" = NOW() WHERE id = $2`, [status, id]);
}

export async function createDocumentChunk(chunk: Partial<DocumentChunk>): Promise<DocumentChunk> {
  const { rows } = await query<DocumentChunk>(
    `INSERT INTO "DocumentChunk" (id, "documentId", "organizationId", index, content, "embeddingRef") 
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
    [chunk.id, chunk.documentId, chunk.organizationId, chunk.index, chunk.content, chunk.embeddingRef]
  );
  return rows[0];
}

// Chat
export async function createChatSession(session: Partial<ChatSession>): Promise<ChatSession> {
  const { rows } = await query<ChatSession>(
    `INSERT INTO "ChatSession" (id, "organizationId", "userId", title) 
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [session.id, session.organizationId, session.userId, session.title]
  );
  return rows[0];
}

export async function createMessage(msg: Partial<Message>): Promise<Message> {
  const { rows } = await query<Message>(
    `INSERT INTO "Message" (id, "chatSessionId", role, content) 
     VALUES ($1, $2, $3, $4) RETURNING *`,
    [msg.id, msg.chatSessionId, msg.role, msg.content]
  );
  return rows[0];
}

export async function createAuditEvent(event: Partial<AuditEvent>): Promise<void> {
  await query(
    `INSERT INTO "AuditEvent" (id, "organizationId", "userId", type, metadata) 
     VALUES ($1, $2, $3, $4, $5)`,
    [event.id, event.organizationId, event.userId, event.type, event.metadata]
  );
}