import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from './useWorkspace';

export interface AutoLikeRun {
  id: string;
  workspace_id: string;
  publisher_id: string;
  target_id: string | null;
  target_name: string | null;
  post_id: string | null;
  post_url: string | null;
  post_excerpt: string | null;
  status: 'liked' | 'skipped_cap' | 'skipped_already' | 'failed';
  error_message: string | null;
  trigger: string;
  run_at: string;
}

export interface DiscoveredPost {
  id: string;
  target_id: string;
  target_name: string | null;
  target_avatar_url: string | null;
  target_linkedin_url: string | null;
  target_title: string | null;
  target_company: string | null;
  content: string | null;
  linkedin_post_url: string;
  published_at: string | null;
  created_at: string;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_liked: boolean;
  is_commented: boolean;
  liked_at: string | null;
  post_metadata: Record<string, unknown>;
}


export interface EngagementSyncRunFull {
  id: string;
  workspace_id: string;
  started_at: string;
  finished_at: string | null;
  total_targets: number;
  synced: number;
  skipped: number;
  failed: number;
  new_posts: number;
  trigger: string;
  details: any;
}

/** Latest N sync runs for the workspace (for CommandBar detail popover + Activity tab). */
export function useEngagementSyncRuns(limit = 20) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ['engagement-sync-runs-list', currentWorkspace?.id, limit],
    queryFn: async () => {
      if (!currentWorkspace) return [] as EngagementSyncRunFull[];
      const { data, error } = await (supabase as any)
        .from('engagement_sync_runs')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .order('started_at', { ascending: false })
        .limit(limit);
      if (error) throw error;
      return (data || []) as EngagementSyncRunFull[];
    },
    enabled: !!currentWorkspace,
    refetchInterval: 5_000,
  });
}

/** Auto-like history for a publisher over the last N days. */
export function useAutoLikeHistory(publisherId: string | null, days: number) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ['auto-like-history', currentWorkspace?.id, publisherId, days],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [] as AutoLikeRun[];
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from('engagement_auto_like_runs')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('publisher_id', publisherId)
        .gte('run_at', since)
        .order('run_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as AutoLikeRun[];
    },
    enabled: !!currentWorkspace && !!publisherId,
  });
}

/** Posts discovered from a publisher's targets over the last N days. */
export function useDiscoveredPosts(publisherId: string | null, days: number) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ['discovered-posts', currentWorkspace?.id, publisherId, days],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [] as DiscoveredPost[];
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data: targets } = await (supabase as any)
        .from('engagement_targets')
        .select('id, name, avatar_url, linkedin_url, title, company_name')
        .eq('publisher_id', publisherId)
        .eq('workspace_id', currentWorkspace.id);
      const targetMap = new Map<string, { name: string; avatar_url: string | null; linkedin_url: string | null; title: string | null; company_name: string | null }>();
      for (const t of (targets || []) as any[]) targetMap.set(t.id, {
        name: t.name, avatar_url: t.avatar_url, linkedin_url: t.linkedin_url, title: t.title, company_name: t.company_name,
      });
      const targetIds = [...targetMap.keys()];
      if (targetIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('engagement_posts')
        .select('id, target_id, content, linkedin_post_url, published_at, created_at, likes_count, comments_count, shares_count, is_liked, is_commented, liked_at, post_metadata')
        .in('target_id', targetIds)
        .gte('created_at', since)
        .order('created_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return ((data || []) as any[]).map((p) => {
        const t = targetMap.get(p.target_id);
        return {
          ...p,
          target_name: t?.name ?? null,
          target_avatar_url: t?.avatar_url ?? null,
          target_linkedin_url: t?.linkedin_url ?? null,
          target_title: t?.title ?? null,
          target_company: t?.company_name ?? null,
        };
      }) as DiscoveredPost[];

    },
    enabled: !!currentWorkspace && !!publisherId,
  });
}

/** Comments posted by a publisher over the last N days. */
export function usePublisherComments(publisherId: string | null, days: number) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ['publisher-comments', currentWorkspace?.id, publisherId, days],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [] as any[];
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data, error } = await (supabase as any)
        .from('engagement_comments')
        .select('id, comment_text, status, posted_at, reaction_count, reply_count, post_id')
        .eq('workspace_id', currentWorkspace.id)
        .eq('publisher_id', publisherId)
        .eq('status', 'posted')
        .gte('posted_at', since)
        .order('posted_at', { ascending: false })
        .limit(500);
      if (error) throw error;
      return (data || []) as any[];
    },
    enabled: !!currentWorkspace && !!publisherId,
  });
}
