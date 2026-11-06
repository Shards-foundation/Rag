import { randomUUID } from "node:crypto";

export type LiteCitation = { documentId: string; title: string; chunkIndex: number; score: number; excerpt?: string };
export type LiteDocument = { id: string; title: string; content: string; mimeType: string; size: number; createdAt: Date };
export type LiteMessage = { role: "user" | "assistant"; content: string; sources?: LiteCitation[] };
export type LiteSession = { id: string; title: string; messages: LiteMessage[]; createdAt: Date; updatedAt: Date };
type OwnerState = {
  documents: LiteDocument[];
  sessions: LiteSession[];
  lastAccessedAt: number;
  documentChars: number;
  messageChars: number;
};
type SharedLiteState = {
  tenants: Map<string, OwnerState>;
  documentChars: number;
  messageChars: number;
  nextCleanupAt: number;
};

const MAX_DOCUMENTS_PER_OWNER = 50;
const MAX_SESSIONS_PER_OWNER = 100;
const MAX_CONTENT_CHARS_PER_OWNER = 5_000_000;
const MAX_ACTIVE_OWNERS = 2_000;
const MAX_TOTAL_DOCUMENT_CHARS = 50_000_000;
const MAX_TOTAL_MESSAGE_CHARS = 50_000_000;
const MAX_MESSAGE_CHARS = 20_000;
const MAX_MESSAGES_PER_SESSION = 100;
const OWNER_IDLE_TTL_MS = 31 * 24 * 60 * 60 * 1_000;
const OWNER_CLEANUP_INTERVAL_MS = 60 * 1_000;

const globalState = globalThis as typeof globalThis & { __luminaLiteStateV2?: SharedLiteState };
const shared = globalState.__luminaLiteStateV2 ??= {
  tenants: new Map<string, OwnerState>(),
  documentChars: 0,
  messageChars: 0,
  nextCleanupAt: 0,
};

function removeOwner(ownerId: string): void {
  const owner = shared.tenants.get(ownerId);
  if (!owner) return;
  shared.documentChars -= owner.documentChars;
  shared.messageChars -= owner.messageChars;
  shared.tenants.delete(ownerId);
}

function cleanupExpiredOwners(now: number): void {
  if (now < shared.nextCleanupAt) return;
  shared.tenants.forEach((owner, ownerId) => {
    if (now - owner.lastAccessedAt >= OWNER_IDLE_TTL_MS) removeOwner(ownerId);
  });
  shared.nextCleanupAt = now + OWNER_CLEANUP_INTERVAL_MS;
}

function state(ownerId: string): OwnerState {
  const now = Date.now();
  cleanupExpiredOwners(now);
  let entry = shared.tenants.get(ownerId);
  if (!entry) {
    if (shared.tenants.size >= MAX_ACTIVE_OWNERS) {
      const oldestOwnerId = shared.tenants.keys().next().value as string | undefined;
      if (oldestOwnerId) removeOwner(oldestOwnerId);
    }
    entry = { documents: [], sessions: [], lastAccessedAt: now, documentChars: 0, messageChars: 0 };
  }
  entry.lastAccessedAt = now;
  // Map insertion order is the LRU order. Refresh the accessed owner in O(1).
  shared.tenants.delete(ownerId);
  shared.tenants.set(ownerId, entry);
  return entry;
}

function discardSession(owner: OwnerState, session: LiteSession): void {
  const chars = session.messages.reduce((total, message) => total + message.content.length, 0);
  owner.messageChars -= chars;
  shared.messageChars -= chars;
}

export const store = {
  getDocuments(ownerId: string): LiteDocument[] {
    return [...state(ownerId).documents];
  },

  addDocument(ownerId: string, title: string, content: string, mimeType: string, size: number): LiteDocument {
    const tenant = state(ownerId);
    if (tenant.documents.length >= MAX_DOCUMENTS_PER_OWNER) throw new Error("Lite Mode allows at most 50 documents per visitor.");
    if (tenant.documentChars + content.length > MAX_CONTENT_CHARS_PER_OWNER) throw new Error("Lite Mode storage limit reached for this visitor.");
    if (shared.documentChars + content.length > MAX_TOTAL_DOCUMENT_CHARS) throw new Error("Lite Mode's temporary shared capacity is full. Try again later.");
    const document = { id: randomUUID(), title, content, mimeType, size, createdAt: new Date() };
    tenant.documents.unshift(document);
    tenant.documentChars += content.length;
    shared.documentChars += content.length;
    return document;
  },

  getSessions(ownerId: string): LiteSession[] {
    return [...state(ownerId).sessions].sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime());
  },

  createSession(ownerId: string): LiteSession {
    const tenant = state(ownerId);
    const session = { id: randomUUID(), title: "New Chat", messages: [], createdAt: new Date(), updatedAt: new Date() };
    tenant.sessions.unshift(session);
    if (tenant.sessions.length > MAX_SESSIONS_PER_OWNER) {
      const removed = tenant.sessions.pop();
      if (removed) discardSession(tenant, removed);
    }
    return session;
  },

  getSession(ownerId: string, id: string): LiteSession | undefined {
    return state(ownerId).sessions.find((session) => session.id === id);
  },

  addMessage(ownerId: string, sessionId: string, role: "user" | "assistant", content: string, sources?: LiteCitation[]): LiteSession | undefined {
    if (content.length > MAX_MESSAGE_CHARS) throw new Error("Lite Mode messages are limited to 20,000 characters.");
    const tenant = state(ownerId);
    const session = tenant.sessions.find((item) => item.id === sessionId);
    if (!session) return undefined;
    const discardedLength = session.messages.length >= MAX_MESSAGES_PER_SESSION ? session.messages[0].content.length : 0;
    if (shared.messageChars - discardedLength + content.length > MAX_TOTAL_MESSAGE_CHARS) {
      throw new Error("Lite Mode's temporary shared chat capacity is full. Try again later.");
    }
    session.messages.push({ role, content, ...(sources ? { sources } : {}) });
    tenant.messageChars += content.length;
    shared.messageChars += content.length;
    if (session.messages.length > MAX_MESSAGES_PER_SESSION) {
      const removed = session.messages.shift();
      if (removed) {
        tenant.messageChars -= removed.content.length;
        shared.messageChars -= removed.content.length;
      }
    }
    session.updatedAt = new Date();
    if (session.messages.length === 1 && role === "user") session.title = content.slice(0, 60) + (content.length > 60 ? "…" : "");
    return session;
  },
};
