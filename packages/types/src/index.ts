export interface UserDTO {
  id: string;
  email: string;
  name?: string | null;
}

export interface DataSourceDTO {
  id: string;
  type: 'MANUAL_UPLOAD' | 'GDRIVE' | 'SLACK';
  status: 'ACTIVE' | 'INDEXING' | 'ERROR';
  displayName: string;
  createdAt: string | Date;
}

export interface ChatSessionDTO {
  id: string;
  title: string;
  updatedAt: string | Date;
}

export interface MessageDTO {
  id: string;
  role: 'USER' | 'ASSISTANT';
  content: string;
  createdAt: string | Date;
}

export interface UploadDocumentInput {
  fileName: string;
  contentBase64: string;
}

export interface MembershipDTO {
  id: string;
  role: 'ADMIN' | 'MEMBER';
  user: {
    id: string;
    email: string;
    name?: string | null;
  };
  createdAt: string | Date;
}