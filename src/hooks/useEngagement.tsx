import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { useWorkspace } from './useWorkspace';
import { useAuth } from './useAuth';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface EngagementTarget {
  id: string;
  workspace_id: string;
  publisher_id: string;
  name: string;
  linkedin_url: string;
  linkedin_username: string | null;
  headline: string | null;
  first_name: string | null;
  last_name: string | null;
  title: string | null;
  company_name: string | null;
  avatar_url: string | null;
  notes: string | null;
  is_active: boolean;
  auto_like: boolean;
  last_fetched_at: string | null;
  last_seen_at: string | null;
  enrichment_status: 'pending' | 'succeeded' | 'failed' | null;
  enriched_at: string | null;
  created_at: string;
}

export interface EngagementPost {
  id: string;
  workspace_id: string;
  target_id: string;
  linkedin_post_urn: string | null;
  linkedin_post_url: string;
  content: string | null;
  published_at: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  is_commented: boolean;
  is_liked: boolean;
  liked_at: string | null;
  post_metadata: Record<string, unknown>;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Like a post
// ---------------------------------------------------------------------------

export function useLikePost() {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();

  return useMutation({
    mutationFn: async ({ publisher_id, post_id, auto }: { publisher_id: string; post_id: string; auto?: boolean }) => {
      if (!currentWorkspace) throw new Error('No workspace');
      const { data, error } = await supabase.functions.invoke('like-linkedin-post', {
        body: { workspace_id: currentWorkspace.id, publisher_id, post_id, auto: !!auto },
      });
      if (error) throw error;
      // cap_reached is a controlled refusal — pass it through, don't throw
      if (!data?.success && !data?.cap_reached) {
        throw new Error(data?.error || 'Failed to like post');
      }
      return data as { success: boolean; already_liked?: boolean; cap_reached?: boolean; count?: number; cap?: number; urn?: string };
    },
    onSuccess: (data, variables) => {
      // Daily cap hit — surface once, no row updates
      if (data?.cap_reached) {
        toast.warning(`Auto-like paused — daily cap reached (${data.count}/${data.cap})`);
        return;
      }
      queryClient.invalidateQueries({ queryKey: ['engagement-posts'] });
      queryClient.invalidateQueries({ queryKey: ['target-counts'] });
      // Suppress per-row success toast for auto-likes (would be noisy)
      if (variables.auto) return;
      toast.success(data?.already_liked ? 'Already liked on LinkedIn' : 'Liked on LinkedIn');
    },
    onError: (error: Error, variables) => {
      // Stay quiet on auto-like failures too — the cap toast already covers the user-visible case
      if (variables.auto) {
        console.warn('Auto-like failed:', error.message);
        return;
      }
      toast.error('Like failed: ' + error.message);
    },
  });
}

export interface EngagementComment {
  id: string;
  workspace_id: string;
  publisher_id: string;
  post_id: string;
  comment_text: string;
  status: string;
  linkedin_comment_urn: string | null;
  posted_at: string | null;
  error_message: string | null;
  reaction_count: number;
  reply_count: number;
  reactions_breakdown: Record<string, number>;
  engagement_fetched_at: string | null;
  created_at: string;
}

// ---------------------------------------------------------------------------
// Fetch comment engagement (reactions + replies)
// ---------------------------------------------------------------------------

export function useFetchCommentEngagement() {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();

  return useMutation({
    mutationFn: async ({ publisher_id }: { publisher_id: string }) => {
      if (!currentWorkspace) throw new Error('No workspace');
      const { data, error } = await supabase.functions.invoke('fetch-comment-engagement', {
        body: { workspace_id: currentWorkspace.id, publisher_id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch engagement');
      return data as { success: boolean; updated_count: number; message?: string };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['engagement-comments'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-comments-by-target'] });
      if (data.updated_count > 0) {
        toast.success(`Updated engagement for ${data.updated_count} comments`);
      } else {
        toast.info(data.message || 'No posted comments to check');
      }
    },
    onError: (error) => {
      toast.error('Failed to fetch engagement: ' + error.message);
    },
  });
}

// ---------------------------------------------------------------------------
// Targets
// ---------------------------------------------------------------------------

export function useEngagementTargets(publisherId: string | null) {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const { data: targets = [], isLoading } = useQuery({
    queryKey: ['engagement-targets', currentWorkspace?.id, publisherId],
    queryFn: async () => {
      if (!currentWorkspace || !publisherId) return [];
      const { data, error } = await (supabase as any)
        .from('engagement_targets')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('publisher_id', publisherId)
        .order('name');
      if (error) throw error;
      return data as EngagementTarget[];
    },
    enabled: !!currentWorkspace && !!publisherId,
    // Poll while any target is mid-enrichment so the UI updates when Apify finishes
    refetchInterval: (query) => {
      const data = query.state.data as EngagementTarget[] | undefined;
      return data?.some((t) => t.enrichment_status === 'pending') ? 4000 : false;
    },
  });

  const createTarget = useMutation({
    mutationFn: async (data: { publisher_id: string; name?: string; linkedin_url: string; headline?: string; notes?: string; skipEnrich?: boolean }) => {
      if (!currentWorkspace) throw new Error('No workspace selected');
      const match = data.linkedin_url.match(/linkedin\.com\/in\/([^/?#]+)/);
      const username = match ? match[1] : null;
      const fallbackName = (data.name && data.name.trim()) || username || data.linkedin_url;

      const { data: result, error } = await (supabase as any)
        .from('engagement_targets')
        .insert({
          workspace_id: currentWorkspace.id,
          publisher_id: data.publisher_id,
          name: fallbackName,
          linkedin_url: data.linkedin_url,
          linkedin_username: username,
          headline: data.headline || null,
          notes: data.notes || null,
          enrichment_status: 'pending',
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;

      // Fire-and-forget enrichment for single adds. Bulk imports pass
      // skipEnrich and run enrichment with throttled concurrency to avoid
      // Apify rate-limit failures.
      if (!data.skipEnrich) {
        (async () => {
          try {
            await supabase.functions.invoke('enrich-engagement-target', {
              body: { target_id: result.id },
            });
          } catch (err) {
            console.error('Enrichment invoke failed:', err);
          } finally {
            queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
          }
        })();
      }

      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
    },
    onError: (error) => {
      toast.error('Failed to add target: ' + error.message);
    },
  });

  const enrichTarget = useMutation({
    mutationFn: async (targetId: string) => {
      const { data, error } = await supabase.functions.invoke('enrich-engagement-target', {
        body: { target_id: targetId },
      });
      if (error) {
        let detail = error.message;
        try {
          const ctx: any = (error as any).context;
          if (ctx && typeof ctx.json === 'function') {
            const body = await ctx.json();
            if (body?.error) detail = body.error;
          }
        } catch { /* ignore */ }
        throw new Error(detail);
      }
      if (data && data.success === false && data.error) {
        throw new Error(data.error);
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      toast.success('Profile refreshed');
    },
    onError: (error) => {
      toast.error('Enrichment failed: ' + error.message);
    },
  });

  const deleteTarget = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await (supabase as any).from('engagement_targets').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      toast.success('Target removed');
    },
    onError: (error) => {
      toast.error('Failed to remove target: ' + error.message);
    },
  });

  const bulkDeleteTargets = useMutation({
    mutationFn: async (ids: string[]) => {
      if (ids.length === 0) return 0;
      const { error } = await (supabase as any).from('engagement_targets').delete().in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      queryClient.invalidateQueries({ queryKey: ['target-counts'] });
      toast.success(`Removed ${count} profile${count === 1 ? '' : 's'}`);
    },
    onError: (e: Error) => toast.error('Bulk delete failed: ' + e.message),
  });

  const bulkReassignTargets = useMutation({
    mutationFn: async ({ ids, publisher_id }: { ids: string[]; publisher_id: string }) => {
      if (ids.length === 0) return 0;
      const { error } = await (supabase as any)
        .from('engagement_targets')
        .update({ publisher_id })
        .in('id', ids);
      if (error) throw error;
      return ids.length;
    },
    onSuccess: (count) => {
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      queryClient.invalidateQueries({ queryKey: ['target-counts'] });
      toast.success(`Moved ${count} profile${count === 1 ? '' : 's'} to new engager`);
    },
    onError: (e: Error) => toast.error('Bulk reassign failed: ' + e.message),
  });

  const markSeen = useMutation({
    mutationFn: async (targetId: string) => {
      const { error } = await (supabase as any)
        .from('engagement_targets')
        .update({ last_seen_at: new Date().toISOString() })
        .eq('id', targetId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
    },
  });

  const updateTarget = useMutation({
    mutationFn: async ({ id, updates }: { id: string; updates: Partial<Pick<EngagementTarget, 'auto_like' | 'notes' | 'name'>> }) => {
      const { error } = await (supabase as any)
        .from('engagement_targets')
        .update(updates)
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
    },
    onError: (error: Error) => {
      toast.error('Update failed: ' + error.message);
    },
  });

  return { targets, isLoading, createTarget, deleteTarget, bulkDeleteTargets, bulkReassignTargets, markSeen, enrichTarget, updateTarget };
}

// ---------------------------------------------------------------------------
// Posts for a target
// ---------------------------------------------------------------------------

export function useEngagementPosts(targetId: string | null) {
  const { currentWorkspace } = useWorkspace();

  const { data: posts = [], isLoading } = useQuery({
    queryKey: ['engagement-posts', currentWorkspace?.id, targetId],
    queryFn: async () => {
      if (!currentWorkspace || !targetId) return [];
      const { data, error } = await (supabase as any)
        .from('engagement_posts')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('target_id', targetId)
        .order('published_at', { ascending: false });
      if (error) throw error;
      return data as EngagementPost[];
    },
    enabled: !!currentWorkspace && !!targetId,
  });

  return { posts, isLoading };
}

// ---------------------------------------------------------------------------
// Fetch posts for a target (calls Edge Function)
// ---------------------------------------------------------------------------

export function useFetchTargetPosts() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ workspace_id, target_id }: { workspace_id: string; target_id: string }) => {
      const { data, error } = await supabase.functions.invoke('fetch-target-posts', {
        body: { workspace_id, target_id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to fetch posts');
      return data as { success: boolean; posts_found: number; profile?: { name?: string; title?: string; company_name?: string; avatar_url?: string } };
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['engagement-posts'] });
      queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
      queryClient.invalidateQueries({ queryKey: ['target-counts'] });
      const profile = data.profile;
      if (profile?.name || profile?.title) {
        toast.success(`${data.posts_found} posts · ${[profile.name, profile.title, profile.company_name].filter(Boolean).join(' · ')}`);
      } else {
        toast.success(`Found ${data.posts_found} posts`);
      }
    },
    onError: (error) => {
      toast.error('Fetch failed: ' + error.message);
    },
  });
}

// ---------------------------------------------------------------------------
// Comments for a post
// ---------------------------------------------------------------------------

export function useEngagementComments(postId: string | null) {
  const { currentWorkspace } = useWorkspace();

  const { data: comments = [], isLoading } = useQuery({
    queryKey: ['engagement-comments', currentWorkspace?.id, postId],
    queryFn: async () => {
      if (!currentWorkspace || !postId) return [];
      const { data, error } = await (supabase as any)
        .from('engagement_comments')
        .select('*')
        .eq('workspace_id', currentWorkspace.id)
        .eq('post_id', postId)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data as EngagementComment[];
    },
    enabled: !!currentWorkspace && !!postId,
  });

  return { comments, isLoading };
}

// ---------------------------------------------------------------------------
// Draft + Post a comment
// ---------------------------------------------------------------------------

export function usePostComment() {
  const queryClient = useQueryClient();
  const { currentWorkspace } = useWorkspace();
  const { user } = useAuth();

  // Save draft comment to DB
  const saveDraft = useMutation({
    mutationFn: async ({ publisher_id, post_id, comment_text }: { publisher_id: string; post_id: string; comment_text: string }) => {
      if (!currentWorkspace) throw new Error('No workspace');
      const { data, error } = await (supabase as any)
        .from('engagement_comments')
        .insert({
          workspace_id: currentWorkspace.id,
          publisher_id,
          post_id,
          comment_text,
          status: 'draft',
          created_by: user?.id || null,
        })
        .select()
        .single();
      if (error) throw error;
      return data as EngagementComment;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['engagement-comments'] });
    },
  });

  // Post comment via Edge Function
  const postComment = useMutation({
    mutationFn: async ({ engagement_comment_id, publisher_id, post_id, comment_text }: {
      engagement_comment_id: string; publisher_id: string; post_id: string; comment_text: string;
    }) => {
      if (!currentWorkspace) throw new Error('No workspace');
      const { data, error } = await supabase.functions.invoke('post-linkedin-comment', {
        body: {
          workspace_id: currentWorkspace.id,
          publisher_id,
          post_id,
          comment_text,
          engagement_comment_id,
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to post comment');
      return data;
    },
    onSuccess: (data, variables) => {
      // Mark the post as commented
      (supabase as any)
        .from('engagement_posts')
        .update({ is_commented: true })
        .eq('id', variables.post_id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['engagement-posts'] });
          queryClient.invalidateQueries({ queryKey: ['target-counts'] });
        });

      // Fallback: if Edge Function didn't update the comment status, do it client-side
      (supabase as any)
        .from('engagement_comments')
        .update({
          status: 'posted',
          linkedin_comment_urn: data?.comment_urn || null,
          posted_at: new Date().toISOString(),
        })
        .eq('id', variables.engagement_comment_id)
        .then(() => {
          queryClient.invalidateQueries({ queryKey: ['engagement-comments'] });
          queryClient.invalidateQueries({ queryKey: ['engagement-comments-by-target'] });
        });

      queryClient.invalidateQueries({ queryKey: ['engagement-comments'] });
      toast.success('Comment posted to LinkedIn');
    },
    onError: (error) => {
      toast.error('Failed to post comment: ' + error.message);
    },
  });

  return { saveDraft, postComment };
}
