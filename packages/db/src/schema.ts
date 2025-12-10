// Domain types for DB entities

export type Organization = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
};

export type User = {
  id: string;
  clerkUserId: string;
  email: string;
  name: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MembershipRole = "ADMIN" | "MEMBER";

export type Membership = {
  id: string;
  userId: string;
  organizationId: string;
  role: MembershipRole;
  createdAt: Date;
  updatedAt: Date;
};

export type DataSourceType = "MANUAL_UPLOAD" | "GDRIVE" | "SLACK";
export type DataSourceStatus = "ACTIVE" | "INDEXING" | "ERROR";

export type DataSource = {
  id: string;
  organizationId: string;
  type: DataSourceType;
  displayName: string;
  status: DataSourceStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentStatus = "PENDING" | "INDEXING" | "ACTIVE" | "ERROR";

export type Document = {
  id: string;
  organizationId: string;
  dataSourceId: string;
  title: string;
  mimeType: string;
  size: number | null;
  status: DocumentStatus;
  createdAt: Date;
  updatedAt: Date;
};

export type DocumentChunk = {
  id: string;
  documentId: string;
  organizationId: string;
  index: number;
  content: string;
  embeddingRef: string | null;
  createdAt: Date;
};

export type ChatSession = {
  id: string;
  organizationId: string;
  userId: string;
  title: string;
  createdAt: Date;
  updatedAt: Date;
};

export type MessageRole = "USER" | "ASSISTANT";

export type Message = {
  id: string;
  chatSessionId: string;
  role: MessageRole;
  content: string;
  createdAt: Date;
};

export type AuditEvent = {
  id: string;
  organizationId: string;
  userId: string | null;
  type: string;
  metadata: any;
  createdAt: Date;
};