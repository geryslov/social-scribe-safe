import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface AppPublishedPost {
  id: string;
  publisher_name: string;
  content: string;
  published_at: string | null;
  linkedin_post_url: string | null;
  linkedin_post_urn: string | null;
  impressions: number | null;
  unique_impressions: number | null;
  reactions: number | null;
  comments_count: number | null;
  reshares: number | null;
  engagement_rate: number | null;
  analytics_fetched_at: string | null;
}

export function useLinkedInPosts(publisherId?: string, publisherName?: string) {
  const queryClient = useQueryClient();

  // Query to fetch app-published posts with analytics from posts table
  const { data: posts = [], isLoading, error } = useQuery({
    queryKey: ['app-published-posts', publisherName],
    queryFn: async () => {
      if (!publisherName) return [];
      
      const { data, error } = await supabase
        .from('posts')
        .select('id, publisher_name, content, published_at, linkedin_post_url, linkedin_post_urn, impressions, unique_impressions, reactions, comments_count, reshares, engagement_rate, analytics_fetched_at')
        .eq('publisher_name', publisherName)
        .eq('publish_method', 'linkedin_api')
        .not('linkedin_post_urn', 'is', null)
        .order('published_at', { ascending: false });
      
      if (error) throw error;
      return data as AppPublishedPost[];
    },
    enabled: !!publisherName,
  });

  // Get last synced time
  const lastSyncedAt = posts.length > 0 
    ? posts.reduce((latest, post) => {
        if (!post.analytics_fetched_at) return latest;
        const postFetchedAt = new Date(post.analytics_fetched_at);
        return postFetchedAt > latest ? postFetchedAt : latest;
      }, new Date(0))
    : null;

  // Mutation to sync analytics from LinkedIn
  const syncPosts = useMutation({
    mutationFn: async () => {
      if (!publisherId) throw new Error('Publisher ID is required');
      
      const { data, error } = await supabase.functions.invoke('fetch-linkedin-posts', {
        body: { publisherId }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['app-published-posts', publisherName] });
      toast.success(`Synced analytics for ${data.syncedCount || 0} posts`);
    },
    onError: (error) => {
      console.error('Error syncing LinkedIn analytics:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to sync LinkedIn analytics');
    },
  });

  // Calculate aggregate stats
  const stats = {
    totalPosts: posts.length,
    totalImpressions: posts.reduce((sum, p) => sum + (p.impressions || 0), 0),
    totalUniqueImpressions: posts.reduce((sum, p) => sum + (p.unique_impressions || 0), 0),
    totalReactions: posts.reduce((sum, p) => sum + (p.reactions || 0), 0),
    totalComments: posts.reduce((sum, p) => sum + (p.comments_count || 0), 0),
    totalReshares: posts.reduce((sum, p) => sum + (p.reshares || 0), 0),
    avgEngagementRate: posts.length > 0 
      ? posts.reduce((sum, p) => sum + (p.engagement_rate || 0), 0) / posts.length
      : 0,
  };

  return {
    posts,
    isLoading,
    error,
    syncPosts,
    isSyncing: syncPosts.isPending,
    lastSyncedAt,
    stats,
  };
}
