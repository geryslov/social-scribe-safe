import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface PostReactor {
  id: string;
  post_id: string;
  actor_urn: string;
  actor_name: string;
  actor_headline: string | null;
  actor_profile_url: string | null;
  reaction_type: string;
  reacted_at: string | null;
}

export function usePostReactors(postId?: string) {
  return useQuery({
    queryKey: ['post-reactors', postId],
    queryFn: async () => {
      if (!postId) return [];
      
      const { data, error } = await supabase
        .from('post_reactors' as any)
        .select('*')
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
      
      if (error) throw error;
      return (data || []) as unknown as PostReactor[];
    },
    enabled: !!postId,
  });
}
