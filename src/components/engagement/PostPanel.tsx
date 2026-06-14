import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEngagementPosts, useFetchTargetPosts, EngagementTarget, EngagementPost, useLikePost, useFetchCommentEngagement } from '@/hooks/useEngagement';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  ExternalLink, ThumbsUp, MessageSquare, Share2, MessageCircle,
  Flame, RefreshCw, Loader2, Linkedin, Trash2, Users,
  CheckCircle2, Building2, Briefcase, Sparkles, Heart, Zap,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommentComposer } from './CommentComposer';
import { CommentEngagementPopover } from './CommentEngagementPopover';
import { useEngagementTargets, EngagementComment } from '@/hooks/useEngagement';

interface PostPanelProps {
  target: EngagementTarget | null;
  publisher: Publisher;
  isAdmin: boolean;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function engagementScore(post: EngagementPost): number {
  return post.likes_count + post.comments_count * 3 + post.shares_count * 5;
}

function engagementTier(post: EngagementPost): 'hot' | 'warm' | 'normal' {
  const total = engagementScore(post);
  if (total >= 200) return 'hot';
  if (total >= 50) return 'warm';
  return 'normal';
}

export function PostPanel({ target, publisher, isAdmin }: PostPanelProps) {
  const { currentWorkspace } = useWorkspace();
  const { posts, isLoading } = useEngagementPosts(target?.id || null);
  const { deleteTarget, updateTarget } = useEngagementTargets(publisher.id);
  const fetchPosts = useFetchTargetPosts();
  const likePost = useLikePost();
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState(false);
  const [feedFilter, setFeedFilter] = useState<'all' | 'new' | 'fresh' | 'engaged' | 'liked' | 'not-liked'>('all');

  // A post is "new" if it landed after the last time the user opened this profile.
  // Falls back to "synced in the last 24h" if the profile has never been viewed.
  const lastSeenMs = target?.last_seen_at ? new Date(target.last_seen_at).getTime() : 0;
  const isNewPost = (p: EngagementPost) => {
    const created = new Date(p.created_at).getTime();
    if (lastSeenMs) return created > lastSeenMs;
    return Date.now() - created < 24 * 60 * 60 * 1000;
  };

  const fetchCommentEngagement = useFetchCommentEngagement();

  // Fetch all comments for this target's posts to show engagement stats
  const { data: allComments = [] } = useQuery({
    queryKey: ['engagement-comments-by-target', currentWorkspace?.id, target?.id],
    queryFn: async () => {
      if (!currentWorkspace || !target) return [];
      const postIds = posts.filter((p) => p.is_commented).map((p) => p.id);
      if (postIds.length === 0) return [];
      const { data, error } = await (supabase as any)
        .from('engagement_comments')
        .select('id, post_id, comment_text, status, reaction_count, reply_count, reactions_breakdown, engagement_fetched_at, posted_at')
        .eq('workspace_id', currentWorkspace.id)
        .eq('status', 'posted')
        .in('post_id', postIds);
      if (error) return [];
      return data as EngagementComment[];
    },
    enabled: !!currentWorkspace && !!target && posts.some((p) => p.is_commented),
  });

  // Map comments by post_id for quick lookup
  const commentsByPostId = allComments.reduce<Record<string, EngagementComment[]>>((acc, c) => {
    if (!acc[c.post_id]) acc[c.post_id] = [];
    acc[c.post_id].push(c);
    return acc;
  }, {});

  const handleSyncEngagement = () => {
    if (!publisher) return;
    fetchCommentEngagement.mutate({ publisher_id: publisher.id });
  };

  const handleFetch = () => {
    if (!currentWorkspace || !target) return;
    setIsFetching(true);
    fetchPosts.mutate(
      { workspace_id: currentWorkspace.id, target_id: target.id },
      { onSettled: () => setIsFetching(false) },
    );
  };

  const handleDelete = () => {
    if (!target) return;
    if (deletingTarget) {
      deleteTarget.mutate(target.id);
      setDeletingTarget(false);
    } else {
      setDeletingTarget(true);
      setTimeout(() => setDeletingTarget(false), 3000);
    }
  };

  // Auto-like: when enabled, like any not-yet-liked posts (one at a time, throttled)
  const autoLikedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    if (!target?.auto_like || !posts.length) return;
    const next = posts.find(
      (p) => !p.is_liked && !autoLikedRef.current.has(p.id) && likingPostId !== p.id,
    );
    if (!next) return;
    autoLikedRef.current.add(next.id);
    setLikingPostId(next.id);
    likePost.mutate(
      { publisher_id: publisher.id, post_id: next.id },
      { onSettled: () => setLikingPostId(null) },
    );
  }, [posts, target?.auto_like, likingPostId, publisher.id, likePost]);


  if (!target) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gradient-to-br from-muted/20 via-background to-muted/10">
        <div className="text-center max-w-sm px-6">
          <div className="h-16 w-16 mx-auto rounded-2xl bg-primary/5 border border-primary/10 flex items-center justify-center mb-4">
            <Users className="h-7 w-7 text-primary/40" />
          </div>
          <p className="font-display font-semibold text-base text-foreground/80">Pick a profile</p>
          <p className="text-sm text-muted-foreground/70 mt-1">
            Select a contact on the left to see their LinkedIn activity and engage from here.
          </p>
        </div>
      </div>
    );
  }

  const initials = target.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  // Aggregate stats
  const totalReactions = posts.reduce((s, p) => s + p.likes_count, 0);
  const totalComments = posts.reduce((s, p) => s + p.comments_count, 0);
  const commentedCount = posts.filter((p) => p.is_commented).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-muted/10">
      {/* ── Profile header — gradient hero ─────────────────────────────── */}
      <div className="relative border-b bg-background overflow-hidden">
        {/* Subtle gradient wash using workspace tokens */}
        <div className="absolute inset-0 bg-gradient-to-br from-primary/[0.04] via-transparent to-accent/[0.04] pointer-events-none" />
        <div className="absolute -top-24 -right-24 h-48 w-48 rounded-full bg-primary/[0.06] blur-3xl pointer-events-none" />

        <div className="relative px-7 py-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-4 min-w-0 flex-1">
              {/* Avatar with ring */}
              <div className="relative flex-shrink-0">
                <div className="absolute -inset-0.5 rounded-full bg-gradient-to-br from-primary to-accent opacity-20 blur-sm" />
                <div className="relative h-16 w-16 rounded-full ring-2 ring-background overflow-hidden bg-primary/10 text-primary text-lg font-bold flex items-center justify-center">
                  {target.avatar_url ? (
                    <img
                      src={target.avatar_url}
                      alt={target.name}
                      referrerPolicy="no-referrer"
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
              </div>

              <div className="min-w-0 flex-1 pt-0.5">
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="font-display font-bold text-xl tracking-tight truncate">
                    {target.name}
                  </h2>
                  <a
                    href={target.linkedin_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center justify-center h-6 w-6 rounded-md text-[#0A66C2] hover:bg-[#0A66C2]/10 transition-colors"
                    title="View on LinkedIn"
                  >
                    <Linkedin className="h-3.5 w-3.5" />
                  </a>
                </div>

                {/* Title + Company chips */}
                <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
                  {target.title && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[11px] font-medium text-foreground/70">
                      <Briefcase className="h-3 w-3 text-muted-foreground/60" />
                      {target.title}
                    </span>
                  )}
                  {target.company_name && (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-muted/60 text-[11px] font-medium text-foreground/70">
                      <Building2 className="h-3 w-3 text-muted-foreground/60" />
                      {target.company_name}
                    </span>
                  )}
                  {!target.title && !target.company_name && target.headline && (
                    <span className="text-xs text-muted-foreground line-clamp-1">{target.headline}</span>
                  )}
                </div>

                {/* Inline stats row */}
                {posts.length > 0 && (
                  <div className="flex items-center gap-4 mt-3 text-[11px] text-muted-foreground/80">
                    <span><span className="font-semibold text-foreground/80">{posts.length}</span> posts</span>
                    <span className="text-border">·</span>
                    <span><span className="font-semibold text-foreground/80">{totalReactions.toLocaleString()}</span> reactions</span>
                    <span className="text-border">·</span>
                    <span><span className="font-semibold text-foreground/80">{totalComments.toLocaleString()}</span> comments</span>
                    {commentedCount > 0 && (
                      <>
                        <span className="text-border">·</span>
                        <span className="text-emerald-600 font-semibold">{commentedCount} engaged</span>
                      </>
                    )}
                    {target.last_fetched_at && (
                      <span className="ml-auto text-muted-foreground/50">
                        Synced {timeAgo(target.last_fetched_at)}
                      </span>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            {isAdmin && (
              <div className="flex items-center gap-2 flex-shrink-0">
                <label
                  className={cn(
                    'flex items-center gap-2 h-9 px-3 rounded-md border text-[11px] font-semibold cursor-pointer transition-all select-none',
                    target.auto_like
                      ? 'bg-rose-50 border-rose-200 text-rose-700'
                      : 'bg-background border-border text-muted-foreground hover:text-foreground',
                  )}
                  title="Automatically like newly synced posts from this contact"
                >
                  <Zap className={cn('h-3.5 w-3.5', target.auto_like && 'fill-current')} />
                  Auto-like
                  <Switch
                    checked={target.auto_like}
                    onCheckedChange={(checked) => {
                      if (!checked) autoLikedRef.current.clear();
                      updateTarget.mutate({ id: target.id, updates: { auto_like: checked } });
                    }}
                    className="ml-1 h-4 w-7 data-[state=checked]:bg-rose-600 [&>span]:h-3 [&>span]:w-3 [&>span]:data-[state=checked]:translate-x-3"
                  />
                </label>
                <Button
                  size="sm"
                  className={cn(
                    'h-9 gap-2 text-xs font-semibold px-3.5',
                    'bg-gradient-to-r from-primary to-primary/90 hover:from-primary hover:to-primary',
                    'shadow-sm shadow-primary/20 hover:shadow-md hover:shadow-primary/30',
                    'transition-all',
                  )}
                  disabled={isFetching}
                  onClick={handleFetch}
                >
                  {isFetching ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {isFetching ? 'Syncing' : 'Sync posts'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-9 gap-1.5 text-xs text-muted-foreground hover:text-primary"
                  onClick={handleSyncEngagement}
                  disabled={fetchCommentEngagement.isPending}
                  title="Check reactions and replies on your comments"
                >
                  {fetchCommentEngagement.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Zap className="h-3.5 w-3.5" />
                  )}
                  {fetchCommentEngagement.isPending ? 'Syncing...' : 'Sync engagement'}
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className={cn(
                    'h-9 w-9 p-0',
                    deletingTarget
                      ? 'text-destructive bg-destructive/10 hover:bg-destructive/15'
                      : 'text-muted-foreground/60 hover:text-destructive hover:bg-destructive/10',
                  )}
                  onClick={handleDelete}
                  title={deletingTarget ? 'Click again to confirm' : 'Remove contact'}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── Feed ───────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {posts.length > 0 && (() => {
          const newCount = posts.filter(isNewPost).length;
          const counts = {
            all: posts.length,
            new: newCount,
            fresh: posts.filter((p) => !p.is_commented && !p.is_liked).length,
            engaged: posts.filter((p) => p.is_commented).length,
            liked: posts.filter((p) => p.is_liked).length,
            'not-liked': posts.filter((p) => !p.is_liked).length,
          } as const;
          const tabs: Array<{ id: typeof feedFilter; label: string }> = [
            { id: 'all', label: 'All' },
            { id: 'new', label: 'New' },
            { id: 'fresh', label: 'Fresh' },
            { id: 'engaged', label: 'Engaged' },
            { id: 'liked', label: 'Liked' },
            { id: 'not-liked', label: 'Not liked' },
          ];
          return (
            <div className="sticky top-0 z-10 px-5 py-2.5 bg-background/80 backdrop-blur border-b flex items-center gap-1.5 overflow-x-auto">
              {tabs.map((t) => {
                const active = feedFilter === t.id;
                return (
                  <button
                    key={t.id}
                    onClick={() => setFeedFilter(t.id)}
                    className={cn(
                      'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap',
                      active
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted',
                    )}
                  >
                    {t.label}
                    <span className={cn(
                      'rounded-full px-1.5 text-[10px] tabular-nums',
                      active ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background text-muted-foreground/70',
                    )}>
                      {counts[t.id]}
                    </span>
                  </button>
                );
              })}
            </div>
          );
        })()}
        {isLoading ? (
          <div className="px-5 py-5 columns-1 md:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
            {[1, 2, 3, 4, 5, 6].map((i) => (
              <div key={i} className="mb-4 break-inside-avoid rounded-xl border bg-background p-4 space-y-3">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/4" />
                <div className="flex gap-3 pt-2">
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-12" />
                  <Skeleton className="h-4 w-12" />
                </div>
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <div className="text-center max-w-sm px-6">
              <div className="h-14 w-14 mx-auto rounded-2xl bg-gradient-to-br from-primary/10 to-accent/10 border border-primary/10 flex items-center justify-center mb-4">
                <Sparkles className="h-6 w-6 text-primary/60" />
              </div>
              <p className="font-display font-semibold text-base">No posts yet</p>
              <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
                Sync to pull the latest LinkedIn activity from <span className="text-foreground/80 font-medium">{target.name}</span>.
              </p>
              {isAdmin && (
                <Button
                  size="sm"
                  onClick={handleFetch}
                  disabled={isFetching}
                  className="gap-1.5 bg-gradient-to-r from-primary to-primary/90 shadow-sm shadow-primary/20"
                >
                  {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sync now
                </Button>
              )}
            </div>
          </div>
        ) : (() => {
          const filtered = posts.filter((p) => {
            switch (feedFilter) {
              case 'fresh': return !p.is_commented && !p.is_liked;
              case 'engaged': return p.is_commented;
              case 'liked': return p.is_liked;
              case 'not-liked': return !p.is_liked;
              default: return true;
            }
          });
          if (filtered.length === 0) {
            return (
              <div className="flex items-center justify-center py-20">
                <p className="text-sm text-muted-foreground">No posts match this filter.</p>
              </div>
            );
          }
          return (
          <div className="px-5 py-5 columns-1 md:columns-2 xl:columns-3 gap-4 [column-fill:_balance]">
            {filtered.map((post: EngagementPost) => {
              const tier = engagementTier(post);
              const isCommenting = commentingPostId === post.id;

              return (
                <article
                  key={post.id}
                  className={cn(
                    'group relative mb-4 break-inside-avoid rounded-xl border bg-background transition-all duration-200',
                    'hover:border-primary/30 hover:shadow-[0_4px_20px_-4px_hsl(var(--primary)/0.08)]',
                    tier === 'hot' && 'border-primary/30 shadow-[0_2px_12px_-2px_hsl(var(--primary)/0.12)]',
                    post.is_commented && 'border-emerald-500/30 bg-emerald-50/30',
                    isCommenting && 'border-primary/50 shadow-[0_4px_20px_-2px_hsl(var(--primary)/0.18)] ring-1 ring-primary/20',
                  )}
                >
                  {/* Left accent stripe for hot posts */}
                  {tier === 'hot' && !post.is_commented && (
                    <div className="absolute left-0 top-4 bottom-4 w-0.5 rounded-r bg-gradient-to-b from-primary to-accent" />
                  )}

                  <div className="px-4 py-3.5">
                    {/* Top row — meta + tags */}
                    <div className="flex items-center gap-2 mb-2.5">
                      <span className="text-[11px] font-medium text-muted-foreground/70">
                        {timeAgo(post.published_at)}
                      </span>

                      {tier === 'hot' && (
                        <Badge
                          variant="secondary"
                          className="h-5 gap-1 px-1.5 bg-gradient-to-r from-primary/10 to-accent/10 text-primary border-primary/20 text-[10px] font-semibold uppercase tracking-wide"
                        >
                          <Flame className="h-2.5 w-2.5" />
                          Hot
                        </Badge>
                      )}
                      {tier === 'warm' && !post.is_commented && (
                        <Badge
                          variant="secondary"
                          className="h-5 px-1.5 bg-amber-50 text-amber-700 border-amber-200/60 text-[10px] font-semibold uppercase tracking-wide"
                        >
                          Warm
                        </Badge>
                      )}
                      {post.is_commented && (() => {
                        const postComments = commentsByPostId[post.id] || [];
                        const topComment = postComments[0];
                        const reactions = topComment?.reaction_count || 0;
                        const replies = topComment?.reply_count || 0;
                        return (
                          <>
                            <Badge
                              variant="secondary"
                              className="h-5 gap-1 px-1.5 bg-emerald-100 text-emerald-700 border-emerald-200/60 text-[10px] font-semibold uppercase tracking-wide"
                            >
                              <CheckCircle2 className="h-2.5 w-2.5" />
                              Replied
                            </Badge>
                            {topComment && (
                              <CommentEngagementPopover
                                engagementCommentId={topComment.id}
                                reactionCount={reactions}
                                replyCount={replies}
                                commentText={topComment.comment_text}
                                postedAt={topComment.posted_at}
                              />
                            )}
                          </>
                        );
                      })()}
                      {post.is_liked && (
                        <Badge
                          variant="secondary"
                          className="h-5 gap-1 px-1.5 bg-rose-50 text-rose-600 border-rose-200/60 text-[10px] font-semibold uppercase tracking-wide"
                        >
                          <Heart className="h-2.5 w-2.5 fill-current" />
                          Liked
                        </Badge>
                      )}


                      <a
                        href={post.linkedin_post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors opacity-0 group-hover:opacity-100"
                        title="Open on LinkedIn"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>

                    {/* Content */}
                    {post.content ? (
                      <p className="text-[13.5px] leading-[1.6] whitespace-pre-wrap text-foreground/90">
                        {post.content}
                      </p>
                    ) : (
                      <p className="text-sm text-muted-foreground italic">
                        Media post (image / video / document)
                      </p>
                    )}

                    {/* Footer — metrics + actions */}
                    <div className="flex items-center justify-between mt-4 pt-3 border-t border-border/50">
                      <div className="flex items-center gap-1">
                        {post.likes_count > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-rose-600/90 hover:bg-rose-50 transition-colors">
                            <ThumbsUp className="h-3 w-3" />
                            {post.likes_count.toLocaleString()}
                          </span>
                        )}
                        {post.comments_count > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-sky-600/90 hover:bg-sky-50 transition-colors">
                            <MessageSquare className="h-3 w-3" />
                            {post.comments_count.toLocaleString()}
                          </span>
                        )}
                        {post.shares_count > 0 && (
                          <span className="inline-flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-semibold text-emerald-600/90 hover:bg-emerald-50 transition-colors">
                            <Share2 className="h-3 w-3" />
                            {post.shares_count.toLocaleString()}
                          </span>
                        )}
                        {engagementScore(post) === 0 && (
                          <span className="text-[11px] text-muted-foreground/50 px-2">No engagement yet</span>
                        )}
                      </div>

                      {isAdmin && (
                        <div className="flex items-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={likingPostId === post.id || post.is_liked}
                            className={cn(
                              'h-7 gap-1.5 text-xs font-semibold px-2.5 transition-all',
                              post.is_liked
                                ? 'text-rose-600 bg-rose-50 hover:bg-rose-50'
                                : 'text-muted-foreground hover:text-rose-600 hover:bg-rose-50',
                            )}
                            onClick={() => {
                              setLikingPostId(post.id);
                              likePost.mutate(
                                { publisher_id: publisher.id, post_id: post.id },
                                { onSettled: () => setLikingPostId(null) },
                              );
                            }}
                          >
                            {likingPostId === post.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Heart className={cn('h-3.5 w-3.5', post.is_liked && 'fill-current')} />
                            )}
                            {post.is_liked ? 'Liked' : 'Like'}
                          </Button>
                          <Button
                            variant={isCommenting ? 'default' : 'ghost'}
                            size="sm"
                            className={cn(
                              'h-7 gap-1.5 text-xs font-semibold px-2.5 transition-all',
                              isCommenting
                                ? 'bg-primary text-primary-foreground shadow-sm shadow-primary/20'
                                : 'text-primary hover:text-primary hover:bg-primary/10',
                            )}
                            onClick={() => setCommentingPostId(isCommenting ? null : post.id)}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            {post.is_commented ? 'Reply again' : 'Engage'}
                          </Button>
                        </div>
                      )}
                    </div>

                    {/* Composer */}
                    {isCommenting && (
                      <div className="mt-3 pt-3 border-t border-primary/15 animate-in slide-in-from-top-2 fade-in duration-200">
                        <CommentComposer
                          post={post}
                          publisher={publisher}
                          onClose={() => setCommentingPostId(null)}
                        />
                      </div>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
          );
        })()}
      </div>
    </div>
  );
}
