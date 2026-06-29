import { useState, useEffect, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  useEngagementPosts, useFetchTargetPosts, EngagementTarget, EngagementPost,
  useLikePost, useFetchCommentEngagement,
} from '@/hooks/useEngagement';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Switch } from '@/components/ui/switch';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  ExternalLink, ThumbsUp, MessageSquare, Share2, MessageCircle,
  RefreshCw, Loader2, Linkedin, Trash2, Users, CheckCircle2,
  Sparkles, Heart, Zap, MoreHorizontal, Activity,
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

// Auto-like pacing — humans don't fire likes at API speed.
// Server enforces a hard daily cap; client adds jittered spacing so the
// burst pattern doesn't look like a bot to LinkedIn's anti-abuse heuristics.
// First like fires fast (400-800ms) so toggling auto-like feels responsive.
// Subsequent likes use the slower 6-12s jitter.
const AUTO_LIKE_FIRST_DELAY_MIN_MS = 400;
const AUTO_LIKE_FIRST_DELAY_MAX_MS = 800;
const AUTO_LIKE_MIN_DELAY_MS = 6_000;
const AUTO_LIKE_MAX_DELAY_MS = 12_000;

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

type FeedFilter = 'live' | 'done' | 'liked';

export function PostPanel({ target, publisher, isAdmin }: PostPanelProps) {
  const { currentWorkspace } = useWorkspace();
  const { posts, isLoading } = useEngagementPosts(target?.id || null);
  const { deleteTarget, updateTarget } = useEngagementTargets(publisher.id);
  const fetchPosts = useFetchTargetPosts();
  const likePost = useLikePost();
  const [composerPost, setComposerPost] = useState<EngagementPost | null>(null);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [feedFilter, setFeedFilter] = useState<FeedFilter>('live');
  const [autoLikeCapReached, setAutoLikeCapReached] = useState(false);

  const fetchCommentEngagement = useFetchCommentEngagement();

  // Posted comments for this target's posts (for the engagement popover)
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

  const commentsByPostId = allComments.reduce<Record<string, EngagementComment[]>>((acc, c) => {
    if (!acc[c.post_id]) acc[c.post_id] = [];
    acc[c.post_id].push(c);
    return acc;
  }, {});

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
    if (confirmDelete) {
      deleteTarget.mutate(target.id);
      setConfirmDelete(false);
    } else {
      setConfirmDelete(true);
      setTimeout(() => setConfirmDelete(false), 3000);
    }
  };

  // Auto-like background loop — jittered spacing + server-enforced daily cap
  const autoLikedRef = useRef<Set<string>>(new Set());
  const autoLikeTimerRef = useRef<number | null>(null);
  const autoLikeBusyRef = useRef(false); // ref-based lock so re-renders don't cancel the in-flight timer
  const likePostRef = useRef(likePost);
  likePostRef.current = likePost;

  // Cap state resets when the publisher changes (different account, different ledger)
  useEffect(() => {
    setAutoLikeCapReached(false);
  }, [publisher.id]);

  // Reset session attempts when the target changes, and cancel any pending timer
  useEffect(() => {
    autoLikedRef.current.clear();
    autoLikeBusyRef.current = false;
    if (autoLikeTimerRef.current) {
      window.clearTimeout(autoLikeTimerRef.current);
      autoLikeTimerRef.current = null;
    }
    setLikingPostId(null);
  }, [target?.id, publisher.id]);

  useEffect(() => {
    if (!target?.auto_like || autoLikeCapReached || !posts.length) return;
    if (autoLikeBusyRef.current) return;

    const next = posts.find(
      (p) => !p.is_liked && !autoLikedRef.current.has(p.id),
    );
    if (!next) return;

    const isFirstInSession = autoLikedRef.current.size === 0;

    autoLikedRef.current.add(next.id);
    autoLikeBusyRef.current = true;
    setLikingPostId(next.id);

    const delay = isFirstInSession
      ? AUTO_LIKE_FIRST_DELAY_MIN_MS + Math.random() * (AUTO_LIKE_FIRST_DELAY_MAX_MS - AUTO_LIKE_FIRST_DELAY_MIN_MS)
      : AUTO_LIKE_MIN_DELAY_MS + Math.random() * (AUTO_LIKE_MAX_DELAY_MS - AUTO_LIKE_MIN_DELAY_MS);

    autoLikeTimerRef.current = window.setTimeout(() => {
      autoLikeTimerRef.current = null;
      likePostRef.current.mutate(
        { publisher_id: publisher.id, post_id: next.id, auto: true },
        {
          onSettled: (data) => {
            autoLikeBusyRef.current = false;
            setLikingPostId(null);
            if (data?.cap_reached) setAutoLikeCapReached(true);
          },
        },
      );
    }, delay);
    // No cleanup: we intentionally let the scheduled like fire even if this
    // effect re-runs from unrelated dep changes. Timer cancellation happens
    // only on target/publisher change (above) or unmount (below).
  }, [posts, target?.auto_like, target?.id, publisher.id, autoLikeCapReached]);

  // Unmount: cancel any pending auto-like timer
  useEffect(() => {
    return () => {
      if (autoLikeTimerRef.current) {
        window.clearTimeout(autoLikeTimerRef.current);
        autoLikeTimerRef.current = null;
      }
    };
  }, []);

  // Derive a stable progress label for the auto-like switch.
  // done = posts already attempted in this session; remaining = unliked posts left to process.
  const autoLikeRemaining = target?.auto_like
    ? posts.filter((p) => !p.is_liked && !autoLikedRef.current.has(p.id)).length
    : 0;
  const autoLikeDone = autoLikedRef.current.size;
  const autoLikeTotal = autoLikeDone + autoLikeRemaining;
  const autoLikeActive = !!target?.auto_like && !autoLikeCapReached && autoLikeTotal > 0 && autoLikeDone < autoLikeTotal;
  const autoLikeInFlight = !!likingPostId;

  if (!target) {
    return (
      <div className="flex-1 flex items-center justify-center bg-background">
        <div className="text-center max-w-sm px-6">
          <div className="h-14 w-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center mb-4">
            <Users className="h-6 w-6 text-amber-600/70" />
          </div>
          <p className="font-display font-semibold text-base text-foreground/80">
            Pick a profile from today's queue
          </p>
          <p className="text-sm text-muted-foreground/70 mt-1.5">
            Choose someone on the left to read their post and write a comment in your voice.
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

  // Filter posts
  const filtered = posts.filter((p) => {
    switch (feedFilter) {
      case 'done': return p.is_commented;
      case 'liked': return p.is_liked;
      case 'live':
      default: return !p.is_commented;
    }
  });

  // Liked tab: most recently liked first, so today's auto-likes surface at the top
  if (feedFilter === 'liked') {
    filtered.sort((a, b) => {
      const ta = a.liked_at ? new Date(a.liked_at).getTime() : 0;
      const tb = b.liked_at ? new Date(b.liked_at).getTime() : 0;
      return tb - ta;
    });
  }

  // Spotlight = top engagement score among Live posts
  const spotlightId = feedFilter === 'live' && filtered.length > 0
    ? filtered.slice().sort((a, b) => engagementScore(b) - engagementScore(a))[0].id
    : null;

  const counts = {
    live: posts.filter((p) => !p.is_commented).length,
    done: posts.filter((p) => p.is_commented).length,
    liked: posts.filter((p) => p.is_liked).length,
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden bg-background">
      {/* ── Slim profile banner (48px) ─────────────────────────────────── */}
      <ProfileBanner
        target={target}
        initials={initials}
        isAdmin={isAdmin}
        isFetching={isFetching}
        confirmDelete={confirmDelete}
        fetchCommentPending={fetchCommentEngagement.isPending}
        autoLikeCapReached={autoLikeCapReached}
        autoLikeActive={autoLikeActive}
        autoLikeInFlight={autoLikeInFlight}
        autoLikeDone={autoLikeDone}
        autoLikeTotal={autoLikeTotal}
        onFetchPosts={handleFetch}
        onSyncEngagement={() => fetchCommentEngagement.mutate({ publisher_id: publisher.id })}
        onDelete={handleDelete}
        onToggleAutoLike={(checked) => {
          if (!checked) {
            autoLikedRef.current.clear();
            autoLikeBusyRef.current = false;
            if (autoLikeTimerRef.current) {
              window.clearTimeout(autoLikeTimerRef.current);
              autoLikeTimerRef.current = null;
              setLikingPostId(null);
            }
            setAutoLikeCapReached(false);
          }
          updateTarget.mutate({ id: target.id, updates: { auto_like: checked } });
        }}
      />

      {/* ── 3-segment filter ───────────────────────────────────────────── */}
      {posts.length > 0 && (
        <div className="px-6 pt-4 pb-2 flex items-center gap-2">
          <SegmentedFilter value={feedFilter} onChange={setFeedFilter} counts={counts} />
        </div>
      )}

      {/* ── Reader ─────────────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="max-w-[680px] mx-auto px-6 py-6 space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="rounded-xl border bg-card p-6 space-y-3">
                <Skeleton className="h-3 w-1/4" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-11/12" />
                <Skeleton className="h-4 w-3/4" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState targetName={target.name} isAdmin={isAdmin} isFetching={isFetching} onFetch={handleFetch} />
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-24">
            <p className="text-sm text-muted-foreground">No posts in this view.</p>
          </div>
        ) : (
          <div className="max-w-[680px] mx-auto px-6 py-6 space-y-4">
            {filtered.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                isSpotlight={post.id === spotlightId}
                isLiking={likingPostId === post.id}
                commentsForPost={commentsByPostId[post.id] || []}
                isAdmin={isAdmin}
                onLike={() => {
                  setLikingPostId(post.id);
                  likePost.mutate(
                    { publisher_id: publisher.id, post_id: post.id },
                    { onSettled: () => setLikingPostId(null) },
                  );
                }}
                onEngage={() => setComposerPost(post)}
              />
            ))}
          </div>
        )}
      </div>

      {/* ── Composer sheet ─────────────────────────────────────────────── */}
      <Sheet open={!!composerPost} onOpenChange={(open) => !open && setComposerPost(null)}>
        <SheetContent
          side="bottom"
          className="max-w-[720px] mx-auto rounded-t-2xl border-t-2 border-amber-200/40 p-0 max-h-[80vh] overflow-hidden flex flex-col"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Engage with {target.name}'s post</SheetTitle>
            <SheetDescription>Draft and post a comment.</SheetDescription>
          </SheetHeader>
          {composerPost && (
            <CommentComposer
              post={composerPost}
              publisher={publisher}
              onClose={() => setComposerPost(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

// -----------------------------------------------------------------------------
// ProfileBanner
// -----------------------------------------------------------------------------

interface ProfileBannerProps {
  target: EngagementTarget;
  initials: string;
  isAdmin: boolean;
  isFetching: boolean;
  confirmDelete: boolean;
  fetchCommentPending: boolean;
  autoLikeCapReached: boolean;
  autoLikeActive: boolean;
  autoLikeInFlight: boolean;
  autoLikeDone: number;
  autoLikeTotal: number;
  onFetchPosts: () => void;
  onSyncEngagement: () => void;
  onDelete: () => void;
  onToggleAutoLike: (checked: boolean) => void;
}

function ProfileBanner({
  target, initials, isAdmin, isFetching, confirmDelete, fetchCommentPending,
  autoLikeCapReached, autoLikeActive, autoLikeInFlight, autoLikeDone, autoLikeTotal,
  onFetchPosts, onSyncEngagement, onDelete, onToggleAutoLike,
}: ProfileBannerProps) {
  return (
    <div className="h-14 px-6 border-b flex items-center gap-3 bg-background">
      <div className="h-9 w-9 rounded-full overflow-hidden bg-muted text-foreground/60 flex items-center justify-center text-[11px] font-bold flex-shrink-0">
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

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <h2 className="font-display font-semibold text-[15px] leading-tight truncate">
            {target.name}
          </h2>
          <a
            href={target.linkedin_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-5 w-5 rounded text-[#0A66C2]/70 hover:text-[#0A66C2] hover:bg-[#0A66C2]/10 transition-colors"
            title="View on LinkedIn"
          >
            <Linkedin className="h-3 w-3" />
          </a>
        </div>
        {(target.title || target.company_name) && (
          <p className="text-[11px] text-muted-foreground truncate leading-tight">
            {[target.title, target.company_name].filter(Boolean).join(' · ')}
          </p>
        )}
      </div>

      {isAdmin && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Auto-like — high-frequency, stays inline. Shows progress while running,
              dims to "Capped" when the daily cap is reached. */}
          <label
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-2 rounded-md border text-[10.5px] font-mono uppercase tracking-wider cursor-pointer transition-colors select-none',
              autoLikeCapReached && target.auto_like
                ? 'bg-muted/60 border-border text-muted-foreground'
                : target.auto_like
                  ? 'bg-amber-50 border-amber-300/60 text-amber-700'
                  : 'bg-background border-border text-muted-foreground hover:text-foreground',
            )}
            title={
              autoLikeCapReached
                ? 'Daily auto-like cap reached. Resumes tomorrow (00:00 UTC).'
                : autoLikeActive
                  ? `Auto-liking · ${autoLikeDone} of ${autoLikeTotal} done`
                  : 'Automatically like newly synced posts'
            }
          >
            {/* Pulsing dot when a like is mid-flight, else static zap */}
            {autoLikeActive && autoLikeInFlight ? (
              <span className="relative inline-flex h-2 w-2">
                <span className="absolute inset-0 rounded-full bg-amber-500 animate-ping opacity-75" />
                <span className="relative h-2 w-2 rounded-full bg-amber-500" />
              </span>
            ) : (
              <Zap className={cn('h-3 w-3', target.auto_like && !autoLikeCapReached && 'fill-current')} />
            )}
            {autoLikeCapReached
              ? 'Capped'
              : autoLikeActive
                ? <>Auto <span className="text-amber-600 tabular-nums">{autoLikeDone}/{autoLikeTotal}</span></>
                : 'Auto'}
            <Switch
              checked={target.auto_like}
              onCheckedChange={onToggleAutoLike}
              className="ml-0.5 h-3.5 w-6 data-[state=checked]:bg-amber-500 [&>span]:h-2.5 [&>span]:w-2.5 [&>span]:data-[state=checked]:translate-x-2.5"
            />
          </label>

          {/* Sync icon */}
          <Button
            variant="ghost"
            size="sm"
            className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
            disabled={isFetching}
            onClick={onFetchPosts}
            title="Sync posts"
          >
            {isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <RefreshCw className="h-3.5 w-3.5" />
            )}
          </Button>

          {/* Overflow */}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-foreground"
              >
                <MoreHorizontal className="h-4 w-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem onClick={onSyncEngagement} disabled={fetchCommentPending}>
                {fetchCommentPending ? (
                  <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                ) : (
                  <Activity className="h-3.5 w-3.5 mr-2" />
                )}
                Refresh engagement stats
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={onDelete}
                className={cn(
                  'text-destructive focus:text-destructive',
                  confirmDelete && 'bg-destructive/10',
                )}
              >
                <Trash2 className="h-3.5 w-3.5 mr-2" />
                {confirmDelete ? 'Click again to confirm' : 'Remove profile'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// SegmentedFilter
// -----------------------------------------------------------------------------

interface SegmentedFilterProps {
  value: FeedFilter;
  onChange: (v: FeedFilter) => void;
  counts: { live: number; done: number; liked: number };
}

function SegmentedFilter({ value, onChange, counts }: SegmentedFilterProps) {
  const segments: Array<{ id: FeedFilter; label: string; count: number; activeClass: string }> = [
    { id: 'live', label: 'Live', count: counts.live, activeClass: 'bg-amber-500 text-white shadow-sm' },
    { id: 'done', label: 'Done', count: counts.done, activeClass: 'bg-emerald-600 text-white shadow-sm' },
    { id: 'liked', label: 'Liked', count: counts.liked, activeClass: 'bg-rose-500 text-white shadow-sm' },
  ];
  return (
    <div className="inline-flex items-center gap-0.5 p-0.5 rounded-lg bg-muted/60 border">
      {segments.map((s) => {
        const active = value === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onChange(s.id)}
            className={cn(
              'inline-flex items-center gap-1.5 h-7 px-3 rounded-md text-[11px] font-semibold transition-colors',
              active
                ? s.activeClass
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {s.label}
            <span className={cn(
              'tabular-nums text-[10px] font-mono',
              active ? 'text-white/85' : 'text-muted-foreground/60',
            )}>
              {s.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}

// -----------------------------------------------------------------------------
// PostCard — editorial reader card
// -----------------------------------------------------------------------------

interface PostCardProps {
  post: EngagementPost;
  isSpotlight: boolean;
  isLiking: boolean;
  isAdmin: boolean;
  commentsForPost: EngagementComment[];
  onLike: () => void;
  onEngage: () => void;
}

function PostCard({
  post, isSpotlight, isLiking, isAdmin, commentsForPost, onLike, onEngage,
}: PostCardProps) {
  const topComment = commentsForPost[0];
  const reactions = topComment?.reaction_count || 0;
  const replies = topComment?.reply_count || 0;

  return (
    <article
      className={cn(
        'relative rounded-xl border bg-card transition-all duration-200',
        isSpotlight && 'border-amber-300/60 shadow-[0_2px_24px_-4px_hsl(43_96%_56%/0.15)]',
        post.is_commented && 'border-border/60',
      )}
    >
      {isSpotlight && (
        <div className="absolute left-0 top-6 bottom-6 w-0.5 rounded-r bg-amber-400" />
      )}

      <div className="px-6 py-5">
        {/* Spotlight micro-label */}
        {isSpotlight && (
          <p className="text-[9.5px] font-mono uppercase tracking-[0.18em] text-amber-700 mb-2.5">
            ◆ Spotlight
          </p>
        )}

        {/* Author meta strip */}
        <div className="flex items-center gap-2 text-[11px] font-mono uppercase tracking-wider text-muted-foreground mb-3.5">
          {post.is_commented && (
            <span className="inline-flex items-center gap-1 text-emerald-700">
              <CheckCircle2 className="h-3 w-3" />
              you replied
            </span>
          )}
          {post.is_commented && <span className="text-border">·</span>}
          {post.is_liked && post.liked_at && (
            <>
              <span
                className="inline-flex items-center gap-1 text-rose-600"
                title={`Liked ${new Date(post.liked_at).toLocaleString()}`}
              >
                <Heart className="h-3 w-3 fill-current" />
                liked {timeAgo(post.liked_at)}
              </span>
              <span className="text-border">·</span>
            </>
          )}
          {post.published_at && (
            <span title={new Date(post.published_at).toLocaleString()}>
              {timeAgo(post.published_at)}
            </span>
          )}
          <a
            href={post.linkedin_post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="ml-auto inline-flex items-center gap-1 text-muted-foreground/60 hover:text-primary transition-colors normal-case tracking-normal font-sans text-[11px]"
            title="Open on LinkedIn"
          >
            Open <ExternalLink className="h-3 w-3" />
          </a>
        </div>

        {/* Post content — editorial */}
        {post.content ? (
          <p className="font-display text-[16.5px] leading-[1.6] whitespace-pre-wrap text-foreground/90">
            {post.content}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            Media post (image / video / document)
          </p>
        )}

        {/* Metric row */}
        <div className="flex items-center gap-4 mt-5 pt-4 border-t border-border/50 text-[11px] text-muted-foreground/80">
          {post.likes_count > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <ThumbsUp className="h-3 w-3" />
              {post.likes_count.toLocaleString()}
            </span>
          )}
          {post.comments_count > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <MessageSquare className="h-3 w-3" />
              {post.comments_count.toLocaleString()}
            </span>
          )}
          {post.shares_count > 0 && (
            <span className="inline-flex items-center gap-1 tabular-nums">
              <Share2 className="h-3 w-3" />
              {post.shares_count.toLocaleString()}
            </span>
          )}
          {engagementScore(post) === 0 && (
            <span className="text-muted-foreground/50">No engagement yet</span>
          )}

          {/* Your reply stats */}
          {post.is_commented && topComment && (
            <span className="ml-auto inline-flex items-center gap-1">
              <span className="text-emerald-700 font-medium">your reply:</span>
              <CommentEngagementPopover
                engagementCommentId={topComment.id}
                reactionCount={reactions}
                replyCount={replies}
                commentText={topComment.comment_text}
                postedAt={topComment.posted_at}
              />
            </span>
          )}
        </div>

        {/* Actions */}
        {isAdmin && (
          <div className="flex items-center gap-2 mt-4">
            <Button
              variant="ghost"
              size="sm"
              disabled={isLiking || post.is_liked}
              className={cn(
                'h-8 gap-1.5 text-xs font-semibold px-3 transition-all',
                post.is_liked
                  ? 'text-rose-600 bg-rose-50 hover:bg-rose-50'
                  : 'text-muted-foreground hover:text-rose-600 hover:bg-rose-50',
              )}
              onClick={onLike}
            >
              {isLiking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Heart className={cn('h-3.5 w-3.5', post.is_liked && 'fill-current')} />
              )}
              {post.is_liked ? 'Liked' : 'Like'}
            </Button>
            <Button
              size="sm"
              className={cn(
                'h-8 gap-1.5 text-xs font-semibold px-3.5 transition-all',
                isSpotlight
                  ? 'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/30'
                  : 'bg-primary hover:bg-primary/90 text-primary-foreground',
              )}
              onClick={onEngage}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {post.is_commented ? 'Reply again' : 'Engage'}
            </Button>
          </div>
        )}
      </div>
    </article>
  );
}

// -----------------------------------------------------------------------------
// EmptyState
// -----------------------------------------------------------------------------

function EmptyState({
  targetName, isAdmin, isFetching, onFetch,
}: {
  targetName: string;
  isAdmin: boolean;
  isFetching: boolean;
  onFetch: () => void;
}) {
  return (
    <div className="flex items-center justify-center py-24">
      <div className="text-center max-w-sm px-6">
        <div className="h-14 w-14 mx-auto rounded-2xl bg-amber-50 border border-amber-200/60 flex items-center justify-center mb-4">
          <Sparkles className="h-6 w-6 text-amber-600/70" />
        </div>
        <p className="font-display font-semibold text-base">No posts yet</p>
        <p className="text-sm text-muted-foreground/70 mt-1 mb-4">
          Sync to pull the latest LinkedIn activity from{' '}
          <span className="text-foreground/80 font-medium">{targetName}</span>.
        </p>
        {isAdmin && (
          <Button
            size="sm"
            onClick={onFetch}
            disabled={isFetching}
            className="gap-1.5"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync now
          </Button>
        )}
      </div>
    </div>
  );
}
