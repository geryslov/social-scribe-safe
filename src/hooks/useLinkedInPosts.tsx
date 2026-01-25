import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface LinkedInPost {
  id: string;
  publisher_id: string;
  linkedin_post_urn: string;
  content: string | null;
  published_at: string | null;
  impressions: number;
  reactions: number;
  comments: number;
  reshares: number;
  engagement_rate: number | null;
  fetched_at: string;
  created_at: string;
}

export function useLinkedInPosts(publisherId?: string) {
  const queryClient = useQueryClient();

  // Query to fetch posts from database
  const { data: posts = [], isLoading, error } = useQuery({
    queryKey: ['linkedin-posts', publisherId],
    queryFn: async () => {
      if (!publisherId) return [];
      
      const { data, error } = await supabase
        .from('linkedin_posts')
        .select('*')
        .eq('publisher_id', publisherId)
        .order('published_at', { ascending: false });
      
      if (error) throw error;
      return data as LinkedInPost[];
    },
    enabled: !!publisherId,
  });

  // Get last synced time
  const lastSyncedAt = posts.length > 0 
    ? posts.reduce((latest, post) => {
        const postFetchedAt = new Date(post.fetched_at);
        return postFetchedAt > latest ? postFetchedAt : latest;
      }, new Date(0))
    : null;

  // Mutation to sync posts from LinkedIn
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
      queryClient.invalidateQueries({ queryKey: ['linkedin-posts', publisherId] });
      toast.success(`Synced ${data.syncedCount || 0} posts from LinkedIn`);
    },
    onError: (error) => {
      console.error('Error syncing LinkedIn posts:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to sync LinkedIn posts');
    },
  });

  // Calculate aggregate stats
  const stats = {
    totalPosts: posts.length,
    totalImpressions: posts.reduce((sum, p) => sum + (p.impressions || 0), 0),
    totalReactions: posts.reduce((sum, p) => sum + (p.reactions || 0), 0),
    totalComments: posts.reduce((sum, p) => sum + (p.comments || 0), 0),
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
