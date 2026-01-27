import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format, subDays, parseISO, startOfDay } from 'date-fns';
import { useWorkspace } from './useWorkspace';

interface PostWithAnalytics {
  id: string;
  content: string;
  publisher_name: string;
  published_at: string | null;
  impressions: number | null;
  unique_impressions: number | null;
  reactions: number | null;
  comments_count: number | null;
  reshares: number | null;
  engagement_rate: number | null;
  linkedin_post_url: string | null;
  status: string;
}

export interface AnalyticsStats {
  totalPosts: number;
  totalImpressions: number;
  totalReach: number;
  totalReactions: number;
  totalComments: number;
  totalReshares: number;
  avgEngagementRate: number;
}

export interface TrendDataPoint {
  date: string;
  impressions: number;
  reach: number;
  reactions: number;
  comments: number;
  reshares: number;
}

export interface TopPost {
  id: string;
  content: string;
  publisherName: string;
  impressions: number;
  reach: number;
  reactions: number;
  engagementRate: number;
  linkedinUrl: string | null;
}

export interface PublisherRanking {
  name: string;
  totalReach: number;
  totalImpressions: number;
  totalReactions: number;
  avgEngagementRate: number;
  postCount: number;
}

export function useAnalytics(publisherName?: string | null, timeRange: '7d' | '30d' | '90d' = '30d') {
  const { currentWorkspace } = useWorkspace();
  const daysAgo = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;
  const startDate = subDays(new Date(), daysAgo);

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['analytics-posts', publisherName, timeRange, currentWorkspace?.id],
    queryFn: async () => {
      if (!currentWorkspace) return [];
      
      let query = supabase
        .from('posts')
        .select('id, content, publisher_name, published_at, impressions, unique_impressions, reactions, comments_count, reshares, engagement_rate, linkedin_post_url, status')
        .eq('status', 'done')
        .eq('workspace_id', currentWorkspace.id)
        .not('published_at', 'is', null);

      if (publisherName) {
        query = query.eq('publisher_name', publisherName);
      }

      const { data, error } = await query.order('published_at', { ascending: false });
      
      if (error) throw error;
      return data as PostWithAnalytics[];
    },
    enabled: !!currentWorkspace,
  });

  // Aggregate stats
  const stats: AnalyticsStats = useMemo(() => {
    const publishedPosts = posts.filter(p => p.status === 'done');
    const totalImpressions = publishedPosts.reduce((sum, p) => sum + (p.impressions || 0), 0);
    const totalReach = publishedPosts.reduce((sum, p) => sum + (p.unique_impressions || 0), 0);
    const totalReactions = publishedPosts.reduce((sum, p) => sum + (p.reactions || 0), 0);
    const totalComments = publishedPosts.reduce((sum, p) => sum + (p.comments_count || 0), 0);
    const totalReshares = publishedPosts.reduce((sum, p) => sum + (p.reshares || 0), 0);
    
    const engagementRates = publishedPosts
      .filter(p => p.engagement_rate !== null && p.engagement_rate > 0)
      .map(p => p.engagement_rate!);
    const avgEngagementRate = engagementRates.length > 0 
      ? engagementRates.reduce((a, b) => a + b, 0) / engagementRates.length 
      : 0;

    return {
      totalPosts: publishedPosts.length,
      totalImpressions,
      totalReach,
      totalReactions,
      totalComments,
      totalReshares,
      avgEngagementRate,
    };
  }, [posts]);

  // Trend data for charts
  const trendData: TrendDataPoint[] = useMemo(() => {
    const dateMap = new Map<string, TrendDataPoint>();
    
    // Initialize all dates in range
    for (let i = daysAgo; i >= 0; i--) {
      const date = format(subDays(new Date(), i), 'yyyy-MM-dd');
      dateMap.set(date, {
        date,
        impressions: 0,
        reach: 0,
        reactions: 0,
        comments: 0,
        reshares: 0,
      });
    }
    
    // Aggregate posts by date
    posts.forEach(post => {
      if (!post.published_at) return;
      const postDate = format(startOfDay(parseISO(post.published_at)), 'yyyy-MM-dd');
      const existing = dateMap.get(postDate);
      if (existing) {
        existing.impressions += post.impressions || 0;
        existing.reach += post.unique_impressions || 0;
        existing.reactions += post.reactions || 0;
        existing.comments += post.comments_count || 0;
        existing.reshares += post.reshares || 0;
      }
    });
    
    return Array.from(dateMap.values());
  }, [posts, daysAgo]);

  // Top performing posts
  const topPosts: TopPost[] = useMemo(() => {
    return posts
      .filter(p => p.engagement_rate !== null && p.engagement_rate > 0)
      .sort((a, b) => (b.engagement_rate || 0) - (a.engagement_rate || 0))
      .slice(0, 5)
      .map(p => ({
        id: p.id,
        content: p.content,
        publisherName: p.publisher_name,
        impressions: p.impressions || 0,
        reach: p.unique_impressions || 0,
        reactions: p.reactions || 0,
        engagementRate: p.engagement_rate || 0,
        linkedinUrl: p.linkedin_post_url,
      }));
  }, [posts]);

  // Publisher rankings (only when no specific publisher is selected)
  const publisherRanking: PublisherRanking[] = useMemo(() => {
    if (publisherName) return [];
    
    const publisherMap = new Map<string, PublisherRanking>();
    
    posts.forEach(post => {
      const name = post.publisher_name;
      if (!publisherMap.has(name)) {
        publisherMap.set(name, {
          name,
          totalReach: 0,
          totalImpressions: 0,
          totalReactions: 0,
          avgEngagementRate: 0,
          postCount: 0,
        });
      }
      
      const pub = publisherMap.get(name)!;
      pub.totalReach += post.unique_impressions || 0;
      pub.totalImpressions += post.impressions || 0;
      pub.totalReactions += post.reactions || 0;
      pub.postCount += 1;
      
      if (post.engagement_rate && post.engagement_rate > 0) {
        pub.avgEngagementRate = (pub.avgEngagementRate * (pub.postCount - 1) + post.engagement_rate) / pub.postCount;
      }
    });
    
    return Array.from(publisherMap.values())
      .sort((a, b) => b.avgEngagementRate - a.avgEngagementRate);
  }, [posts, publisherName]);

  // Averages for comparison
  const averages = useMemo(() => {
    if (posts.length === 0) return { impressions: 0, reach: 0, reactions: 0, engagement: 0 };
    
    return {
      impressions: stats.totalImpressions / posts.length,
      reach: stats.totalReach / posts.length,
      reactions: stats.totalReactions / posts.length,
      engagement: stats.avgEngagementRate,
    };
  }, [posts, stats]);

  return {
    posts,
    stats,
    trendData,
    topPosts,
    publisherRanking,
    averages,
    isLoading,
  };
}
