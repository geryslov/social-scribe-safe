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
  // LinkedIn publishing tracking
  publishedAt?: string | null;
  linkedinPostUrl?: string | null;
  publishMethod?: 'linkedin_api' | 'copied' | 'manual' | null;
}
