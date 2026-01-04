export interface Post {
  id: string;
  publisherName: string;
  publisherRole: string;
  linkedinUrl: string;
  content: string;
  scheduledDate: string;
  status: 'draft' | 'scheduled' | 'done';
  labels?: string[];
  documentId?: string | null;
}
