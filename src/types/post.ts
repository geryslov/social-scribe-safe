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
  // Analytics fields
  impressions?: number | null;
  unique_impressions?: number | null;
  reactions?: number | null;
  comments_count?: number | null;
  reshares?: number | null;
  engagement_rate?: number | null;
}
