export type PostType = 'text' | 'image' | 'video' | 'link' | 'document';

export interface ReactionBreakdown {
  like: number;
  celebrate: number;
  support: number;
  love: number;
  insightful: number;
  curious: number;
}

export interface VideoMetrics {
  views: number;
  uniqueViewers: number;
  watchTimeSeconds: number;
  completionRate: number | null;
  milestone25: number;
  milestone50: number;
  milestone75: number;
  milestone100: number;
}

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
  mediaUrl?: string | null;
  // LinkedIn publishing tracking
  publishedAt?: string | null;
  linkedinPostUrl?: string | null;
  publishMethod?: 'linkedin_api' | 'copied' | 'manual' | null;
  // Post metadata
  postType?: PostType | null;
  mediaUrns?: string[] | null;
  // Analytics fields
  impressions?: number | null;
  unique_impressions?: number | null;
  reactions?: number | null;
  comments_count?: number | null;
  reshares?: number | null;
  engagement_rate?: number | null;
  // Reaction breakdown
  reactionBreakdown?: ReactionBreakdown | null;
  // Conversation metrics
  avgReplyDepth?: number | null;
  threadCount?: number | null;
  // Link analytics (org posts only)
  linkClicks?: number | null;
  clickThroughRate?: number | null;
  // Video metrics
  videoMetrics?: VideoMetrics | null;
}
