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


/** A comment a target left on someone else's post (their outbound activity). */
export interface DiscoveredComment {
  id: string;
  target_id: string;
  target_name: string | null;
  target_avatar_url: string | null;
  target_linkedin_url: string | null;
  target_title: string | null;
  target_company: string | null;
  comment_url: string | null;
  comment_urn: string | null;
  comment_text: string | null;
  commented_at: string | null;
  created_at: string;
  reactions_count: number;
  parent_post_url: string | null;
  parent_post_author_name: string | null;
  parent_post_author_headline: string | null;
  parent_post_author_url: string | null;
  parent_post_content: string | null;
  parent_post_published_at: string | null;
  comment_metadata: Record<string, any> | null;
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

/** Comments a publisher's targets left on other people's posts, last N days. */
export function useDiscoveredComments(publisherId: string | null, days: number) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ['discovered-comments', currentWorkspace?.id, publisherId, days],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [] as DiscoveredComment[];
      const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
      const { data: targets } = await (supabase as any)
        .from('engagement_targets')
        .select('id, name, avatar_url, linkedin_url, title, company_name')
        .eq('publisher_id', publisherId)
        .eq('workspace_id', currentWorkspace.id);
      const targetMap = new Map<string, any>();
      for (const t of (targets || []) as any[]) targetMap.set(t.id, t);
      const targetIds = [...targetMap.keys()];
      if (targetIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('engagement_target_comments')
        .select('id, target_id, comment_url, comment_urn, comment_text, commented_at, created_at, reactions_count, parent_post_url, parent_post_author_name, parent_post_author_headline, parent_post_author_url, parent_post_content, parent_post_published_at, comment_metadata')
        .in('target_id', targetIds)
        .gte('created_at', since)
        .order('commented_at', { ascending: false })
        .limit(500);
      // Table may not exist yet (migration not deployed) — degrade to empty.
      if (error) {
        console.warn('discovered-comments query failed (table missing?):', error.message);
        return [];
      }
      return ((data || []) as any[]).map((c) => {
        const t = targetMap.get(c.target_id);
        return {
          ...c,
          target_name: t?.name ?? null,
          target_avatar_url: t?.avatar_url ?? null,
          target_linkedin_url: t?.linkedin_url ?? null,
          target_title: t?.title ?? null,
          target_company: t?.company_name ?? null,
        };
      }) as DiscoveredComment[];
    },
    enabled: !!currentWorkspace && !!publisherId,
  });
}

/** A single target's comments on other people's posts (for the review drawer). */
export function useTargetComments(targetId: string | null) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ['target-comments', currentWorkspace?.id, targetId],
    queryFn: async () => {
      if (!currentWorkspace || !targetId) return [] as DiscoveredComment[];
      const { data, error } = await (supabase as any)
        .from('engagement_target_comments')
        .select('id, target_id, comment_url, comment_urn, comment_text, commented_at, created_at, reactions_count, parent_post_url, parent_post_author_name, parent_post_author_headline, parent_post_author_url, parent_post_content, parent_post_published_at, comment_metadata')
        .eq('workspace_id', currentWorkspace.id)
        .eq('target_id', targetId)
        .order('commented_at', { ascending: false })
        .limit(100);
      if (error) {
        console.warn('target-comments query failed (table missing?):', error.message);
        return [];
      }
      return (data || []) as DiscoveredComment[];
    },
    enabled: !!currentWorkspace && !!targetId,
  });
}

/** A like the publisher performed today — on a target's post or their comment. */
export interface LikeToday {
  kind: 'post' | 'comment';
  id: string;
  target_id: string;
  target_name: string | null;
  target_avatar_url: string | null;
  target_linkedin_url?: string | null;
  text: string | null;
  url: string | null;
  liked_at: string;
}

/**
 * Every like the publisher's account performed TODAY — manual OR auto, on posts
 * AND on target comments. Derived from is_liked/liked_at (posts) and
 * comment_metadata.is_liked/liked_at (comments), so it captures all likes, not
 * just the auto-like ledger.
 */
export function useLikesToday(publisherId: string | null) {
  return useLikesHistory(publisherId, 1);
}

/**
 * Every like the publisher's account performed over the last N days (N=1 means
 * "since midnight today"). Posts come from is_liked/liked_at, comments from
 * comment_metadata.is_liked/liked_at.
 */
export function useLikesHistory(publisherId: string | null, days: number) {
  const { currentWorkspace } = useWorkspace();
  return useQuery({
    queryKey: ['likes-history', currentWorkspace?.id, publisherId, days],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [] as LikeToday[];
      const start = new Date();
      start.setHours(0, 0, 0, 0);
      if (days > 1) start.setDate(start.getDate() - (days - 1));
      const startMs = start.getTime();
      const sinceIso = start.toISOString();

      const { data: targets } = await (supabase as any)
        .from('engagement_targets')
        .select('id, name, avatar_url, linkedin_url')
        .eq('publisher_id', publisherId)
        .eq('workspace_id', currentWorkspace.id);
      const tmap = new Map<string, { name: string; avatar_url: string | null; linkedin_url: string | null }>();
      for (const t of (targets || []) as any[]) tmap.set(t.id, { name: t.name, avatar_url: t.avatar_url, linkedin_url: t.linkedin_url });
      const ids = [...tmap.keys()];
      if (ids.length === 0) return [] as LikeToday[];

      const out: LikeToday[] = [];

      // Post likes today
      const { data: posts } = await (supabase as any)
        .from('engagement_posts')
        .select('id, target_id, content, linkedin_post_url, liked_at')
        .in('target_id', ids)
        .eq('is_liked', true)
        .gte('liked_at', sinceIso)
        .order('liked_at', { ascending: false })
        .limit(1000);
      for (const p of (posts || []) as any[]) {
        const t = tmap.get(p.target_id);
        out.push({
          kind: 'post', id: p.id, target_id: p.target_id,
          target_name: t?.name ?? null, target_avatar_url: t?.avatar_url ?? null,
          target_linkedin_url: t?.linkedin_url ?? null,
          text: p.content ?? null, url: p.linkedin_post_url ?? null, liked_at: p.liked_at,
        });
      }

      // Comment likes today (is_liked lives in comment_metadata JSONB — filter client-side).
      // Tolerant of a missing table: on error, `comments` is null and we skip.
      const { data: comments } = await (supabase as any)
        .from('engagement_target_comments')
        .select('id, target_id, comment_text, comment_url, comment_metadata')
        .in('target_id', ids)
        .order('created_at', { ascending: false })
        .limit(1000);
      for (const c of (comments || []) as any[]) {
        const m = (c.comment_metadata || {}) as Record<string, any>;
        if (!m.is_liked || !m.liked_at) continue;
        if (new Date(m.liked_at).getTime() < startMs) continue;
        const t = tmap.get(c.target_id);
        out.push({
          kind: 'comment', id: c.id, target_id: c.target_id,
          target_name: t?.name ?? null, target_avatar_url: t?.avatar_url ?? null,
          target_linkedin_url: t?.linkedin_url ?? null,
          text: c.comment_text ?? null, url: c.comment_url ?? null, liked_at: m.liked_at,
        });
      }

      out.sort((a, b) => new Date(b.liked_at).getTime() - new Date(a.liked_at).getTime());
      return out;
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
