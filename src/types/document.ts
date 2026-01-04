export type DocumentStatus = 'draft' | 'in_review' | 'approved' | 'split';

export interface Document {
  id: string;
  title: string;
  content: string;
  originalContent: string;
  status: DocumentStatus;
  fileName: string | null;
  fileUrl: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
  notes: string | null;
}

export interface DocumentComment {
  id: string;
  documentId: string;
  userId: string | null;
  userEmail: string;
  content: string;
  createdAt: string;
}
