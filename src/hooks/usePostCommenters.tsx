import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PostComment {
  id: string;
  post_id: string;
  author_urn: string | null;
  author_name: string | null;
  author_headline: string | null;
  author_profile_url: string | null;
  content: string | null;
  commented_at: string | null;
  linkedin_comment_urn: string | null;
}

export function usePostCommenters(postId?: string) {
  return useQuery({
    queryKey: ['post-comments', postId],
    queryFn: async () => {
      if (!postId) return [];
      
      const { data, error } = await supabase
        .from('post_comments')
        .select('*')
        .eq('post_id', postId)
        .order('commented_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as PostComment[];
    },
    enabled: !!postId,
  });
}
