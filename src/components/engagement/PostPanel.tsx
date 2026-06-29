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

      {/* ── Reader (enterprise / compact) ──────────────────────────────── */}
      <div className="flex-1 overflow-y-auto bg-[#fafafa]">
        {isLoading ? (
          <div className="max-w-[820px] mx-auto px-4 py-3 divide-y divide-border border border-border bg-white mt-3 rounded-sm">
            {[1, 2, 3].map((i) => (
              <div key={i} className="py-3 space-y-1.5">
                <Skeleton className="h-2.5 w-1/4" />
                <Skeleton className="h-3 w-full" />
                <Skeleton className="h-3 w-11/12" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState targetName={target.name} isAdmin={isAdmin} isFetching={isFetching} onFetch={handleFetch} />
        ) : filtered.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <p className="text-[11px] text-muted-foreground font-mono uppercase tracking-wider">No posts in this view</p>
          </div>
        ) : (
          <EnterpriseFeed
            posts={filtered}
            spotlightId={spotlightId}
            commentsByPostId={commentsByPostId}
            likingPostId={likingPostId}
            isAdmin={isAdmin}
            onLike={(post) => {
              setLikingPostId(post.id);
              likePost.mutate(
                { publisher_id: publisher.id, post_id: post.id },
                { onSettled: () => setLikingPostId(null) },
              );
            }}
            onEngage={(post) => setComposerPost(post)}
          />
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
  const segments: Array<{ id: FeedFilter; label: string; count: number }> = [
    { id: 'live', label: 'Live', count: counts.live },
    { id: 'done', label: 'Done', count: counts.done },
    { id: 'liked', label: 'Liked', count: counts.liked },
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
                ? 'bg-[#4f46e5] text-white shadow-sm shadow-[#4f46e5]/30'
                : 'text-muted-foreground hover:text-foreground',
            )}
            style={active ? { fontFamily: "'Space Grotesk', system-ui, sans-serif" } : undefined}
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
// MagazineFeed — featured spotlight + dense grid of supporting posts
// -----------------------------------------------------------------------------

interface MagazineFeedProps {
  posts: EngagementPost[];
  spotlightId: string | null;
  feedFilter: FeedFilter;
  commentsByPostId: Record<string, EngagementComment[]>;
  likingPostId: string | null;
  isAdmin: boolean;
  onLike: (post: EngagementPost) => void;
  onEngage: (post: EngagementPost) => void;
}

function MagazineFeed({
  posts, spotlightId, commentsByPostId, likingPostId, isAdmin, onLike, onEngage,
}: MagazineFeedProps) {
  const spotlight = spotlightId ? posts.find((p) => p.id === spotlightId) : null;
  const rest = spotlight ? posts.filter((p) => p.id !== spotlight.id) : posts;

  return (
    <div className="max-w-[860px] mx-auto px-4 sm:px-6 py-5 space-y-4">
      {spotlight && (
        <PostCard
          post={spotlight}
          variant="hero"
          isLiking={likingPostId === spotlight.id}
          commentsForPost={commentsByPostId[spotlight.id] || []}
          isAdmin={isAdmin}
          onLike={() => onLike(spotlight)}
          onEngage={() => onEngage(spotlight)}
        />
      )}

      {rest.length > 0 && (
        <>
          {spotlight && (
            <div className="flex items-center gap-3 pt-2">
              <span
                className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/40"
                style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
              >
                More from this feed
              </span>
              <div className="flex-1 h-px bg-gradient-to-r from-white/10 to-transparent" />
            </div>
          )}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {rest.map((post) => (
              <PostCard
                key={post.id}
                post={post}
                variant="grid"
                isLiking={likingPostId === post.id}
                commentsForPost={commentsByPostId[post.id] || []}
                isAdmin={isAdmin}
                onLike={() => onLike(post)}
                onEngage={() => onEngage(post)}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// -----------------------------------------------------------------------------
// PostCard — Midnight Indigo editorial / magazine treatment
// -----------------------------------------------------------------------------

interface PostCardProps {
  post: EngagementPost;
  variant: 'hero' | 'grid';
  isLiking: boolean;
  isAdmin: boolean;
  commentsForPost: EngagementComment[];
  onLike: () => void;
  onEngage: () => void;
}

function PostCard({
  post, variant, isLiking, isAdmin, commentsForPost, onLike, onEngage,
}: PostCardProps) {
  const isHero = variant === 'hero';
  const topComment = commentsForPost[0];
  const reactions = topComment?.reaction_count || 0;
  const replies = topComment?.reply_count || 0;

  const display = { fontFamily: "'Space Grotesk', system-ui, sans-serif" } as const;

  return (
    <article
      className={cn(
        'group relative rounded-2xl border backdrop-blur-sm transition-all duration-300',
        'border-white/[0.07] bg-white/[0.025] hover:bg-white/[0.045] hover:border-white/[0.12]',
        isHero && 'border-[#4f46e5]/40 bg-gradient-to-br from-[#1e1e5a]/30 via-white/[0.03] to-transparent hover:border-[#4f46e5]/60',
        post.is_commented && !isHero && 'border-emerald-400/20',
      )}
      style={
        isHero
          ? { boxShadow: '0 24px 60px -20px rgba(79,70,229,0.45), inset 0 1px 0 rgba(255,255,255,0.04)' }
          : { boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.03)' }
      }
    >
      {/* indigo accent rail on hero */}
      {isHero && (
        <div className="absolute left-0 top-8 bottom-8 w-[3px] rounded-r-full bg-gradient-to-b from-[#4f46e5] via-[#6366f1] to-transparent" />
      )}

      <div className={cn('relative', isHero ? 'p-5 sm:p-6' : 'p-4')}>
        {/* Eyebrow */}
        <div className="flex items-center gap-2 mb-3">
          {isHero && (
            <span
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-[#4f46e5]/20 border border-[#4f46e5]/30 text-[9.5px] font-semibold uppercase tracking-[0.18em] text-indigo-200"
              style={display}
            >
              <span className="h-1 w-1 rounded-full bg-indigo-300 animate-pulse" />
              Spotlight
            </span>
          )}
          {post.is_commented && (
            <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-emerald-300/90">
              <CheckCircle2 className="h-3 w-3" />
              replied
            </span>
          )}
          {post.is_liked && post.liked_at && (
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-rose-300/90"
              title={`Liked ${new Date(post.liked_at).toLocaleString()}`}
            >
              <Heart className="h-3 w-3 fill-current" />
              liked · {timeAgo(post.liked_at)}
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            {post.published_at && (
              <span
                className="text-[10px] font-mono uppercase tracking-wider text-white/35"
                title={new Date(post.published_at).toLocaleString()}
              >
                {timeAgo(post.published_at)}
              </span>
            )}
            <a
              href={post.linkedin_post_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-6 w-6 rounded-md text-white/40 hover:text-indigo-200 hover:bg-white/5 transition-colors"
              title="Open on LinkedIn"
            >
              <ExternalLink className="h-3 w-3" />
            </a>
          </div>
        </div>

        {/* Post content */}
        {post.content ? (
          <p
            className={cn(
              'whitespace-pre-wrap text-white/90',
              isHero
                ? 'text-[15px] sm:text-[16px] leading-[1.55] font-medium line-clamp-[10]'
                : 'text-[13px] leading-[1.55] line-clamp-5',
            )}
            style={isHero ? display : undefined}
          >
            {post.content}
          </p>
        ) : (
          <p className="text-sm text-white/40 italic">Media post (image / video / document)</p>
        )}

        {/* Metric row */}
        <div
          className={cn(
            'flex items-center flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/50',
            isHero ? 'mt-4 pt-3 border-t border-white/[0.07]' : 'mt-3 pt-2.5 border-t border-white/[0.05]',
          )}
        >
          {post.likes_count > 0 && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <ThumbsUp className="h-3 w-3 text-indigo-300/70" />
              {post.likes_count.toLocaleString()}
            </span>
          )}
          {post.comments_count > 0 && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <MessageSquare className="h-3 w-3 text-indigo-300/70" />
              {post.comments_count.toLocaleString()}
            </span>
          )}
          {post.shares_count > 0 && (
            <span className="inline-flex items-center gap-1.5 tabular-nums">
              <Share2 className="h-3 w-3 text-indigo-300/70" />
              {post.shares_count.toLocaleString()}
            </span>
          )}
          {engagementScore(post) === 0 && (
            <span className="text-white/30 font-mono uppercase tracking-wider text-[10px]">No engagement yet</span>
          )}

          {post.is_commented && topComment && (
            <span className="ml-auto inline-flex items-center gap-1.5">
              <span className="text-emerald-300/80 font-medium text-[10.5px] uppercase tracking-wider font-mono">
                your reply
              </span>
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
          <div className={cn('flex items-center gap-2', isHero ? 'mt-4' : 'mt-3')}>
            <button
              type="button"
              disabled={isLiking || post.is_liked}
              onClick={onLike}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-3 rounded-lg text-[12px] font-semibold transition-all',
                post.is_liked
                  ? 'text-rose-200 bg-rose-500/15 border border-rose-400/25'
                  : 'text-white/60 hover:text-rose-200 hover:bg-rose-500/10 border border-white/10 hover:border-rose-400/30',
                (isLiking || post.is_liked) && 'cursor-default',
              )}
            >
              {isLiking ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Heart className={cn('h-3.5 w-3.5', post.is_liked && 'fill-current')} />
              )}
              {post.is_liked ? 'Liked' : 'Like'}
            </button>
            <button
              type="button"
              onClick={onEngage}
              className={cn(
                'inline-flex items-center gap-1.5 h-8 px-4 rounded-lg text-[12px] font-semibold transition-all',
                isHero
                  ? 'bg-gradient-to-r from-[#4f46e5] to-[#6366f1] text-white shadow-lg shadow-[#4f46e5]/40 hover:shadow-[#4f46e5]/60 hover:from-[#4338ca] hover:to-[#4f46e5]'
                  : 'bg-white/10 text-white hover:bg-[#4f46e5] border border-white/10 hover:border-[#4f46e5]',
              )}
              style={isHero ? display : undefined}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              {post.is_commented ? 'Reply again' : 'Engage'}
            </button>
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
        <div className="h-14 w-14 mx-auto rounded-2xl bg-[#4f46e5]/15 border border-[#4f46e5]/30 flex items-center justify-center mb-4">
          <Sparkles className="h-6 w-6 text-indigo-300" />
        </div>
        <p
          className="font-semibold text-base text-white/90"
          style={{ fontFamily: "'Space Grotesk', system-ui, sans-serif" }}
        >
          No posts yet
        </p>
        <p className="text-sm text-white/50 mt-1 mb-4">
          Sync to pull the latest LinkedIn activity from{' '}
          <span className="text-white/80 font-medium">{targetName}</span>.
        </p>
        {isAdmin && (
          <Button
            size="sm"
            onClick={onFetch}
            disabled={isFetching}
            className="gap-1.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white border-0"
          >
            {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Sync now
          </Button>
        )}
      </div>
    </div>
  );
}

