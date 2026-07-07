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
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  onCleared?: () => void;
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

export function PostPanel({ target, publisher, isAdmin, onCleared }: PostPanelProps) {
  const { currentWorkspace } = useWorkspace();
  const { posts, isLoading } = useEngagementPosts(target?.id || null);
  const { deleteTarget, updateTarget } = useEngagementTargets(publisher.id);
  const fetchPosts = useFetchTargetPosts();
  const likePost = useLikePost();
  const [composerPost, setComposerPost] = useState<EngagementPost | null>(null);
  const [likingPostId, setLikingPostId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [confirmDeleteOpen, setConfirmDeleteOpen] = useState(false);
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
    setConfirmDeleteOpen(true);
  };

  const confirmDeleteNow = () => {
    if (!target) return;
    deleteTarget.mutate(target.id, {
      onSuccess: () => {
        setConfirmDeleteOpen(false);
        onCleared?.();
      },
    });
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
        confirmDelete={false}
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
          updateTarget.mutate(
            { id: target.id, updates: { auto_like: checked } },
            {
              onSuccess: () => {
                // Kick the server-side auto-liker immediately so it works even
                // if the user closes the panel or the client-side loop misses.
                if (checked && currentWorkspace) {
                  supabase.functions.invoke('auto-like-target-posts', {
                    body: {
                      workspace_id: currentWorkspace.id,
                      target_id: target.id,
                      trigger: 'toggle',
                    },
                  }).catch((e) => console.warn('auto-like kick failed:', e));
                }
              },
            },
          );
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

      <AlertDialog open={confirmDeleteOpen} onOpenChange={setConfirmDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove {target.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the profile from your engagement list and deletes all fetched posts
              and drafted comments for them. This cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); confirmDeleteNow(); }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteTarget.isPending ? 'Removing…' : 'Remove profile'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
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
// EnterpriseFeed — dense single-column list, table-like
// -----------------------------------------------------------------------------

interface EnterpriseFeedProps {
  posts: EngagementPost[];
  spotlightId: string | null;
  commentsByPostId: Record<string, EngagementComment[]>;
  likingPostId: string | null;
  isAdmin: boolean;
  onLike: (post: EngagementPost) => void;
  onEngage: (post: EngagementPost) => void;
}

function EnterpriseFeed({
  posts, spotlightId, commentsByPostId, likingPostId, isAdmin, onLike, onEngage,
}: EnterpriseFeedProps) {
  return (
    <div className="max-w-[820px] mx-auto px-4 py-3">
      <div className="border border-border bg-white rounded-sm">
        {/* column header strip */}
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 h-7 border-b border-border bg-[#f6f7f9] text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>Post</span>
          <span className="tabular-nums">Likes · Comments · Shares</span>
        </div>
        <ul className="divide-y-[6px] divide-[#eef0f3]">
          {posts.map((post) => (
            <PostRow
              key={post.id}
              post={post}
              isSpotlight={post.id === spotlightId}
              isLiking={likingPostId === post.id}
              commentsForPost={commentsByPostId[post.id] || []}
              isAdmin={isAdmin}
              onLike={() => onLike(post)}
              onEngage={() => onEngage(post)}
            />
          ))}
        </ul>
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// PostRow — compact enterprise row
// -----------------------------------------------------------------------------

interface PostRowProps {
  post: EngagementPost;
  isSpotlight: boolean;
  isLiking: boolean;
  isAdmin: boolean;
  commentsForPost: EngagementComment[];
  onLike: () => void;
  onEngage: () => void;
}

function PostRow({
  post, isSpotlight, isLiking, isAdmin, commentsForPost, onLike, onEngage,
}: PostRowProps) {
  const [expanded, setExpanded] = useState(false);
  const topComment = commentsForPost[0];
  const reactions = topComment?.reaction_count || 0;
  const replies = topComment?.reply_count || 0;

  return (
    <li
      className={cn(
        'relative px-4 py-4 hover:bg-[#fafbfc] transition-colors',
        isSpotlight && 'bg-[#fbfaff]',
      )}
    >
      {isSpotlight && (
        <span className="absolute left-0 top-2 bottom-2 w-[2px] bg-[#4f46e5]" />
      )}

      {/* meta row */}
      <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground mb-1">
        {isSpotlight && (
          <span className="text-[#4f46e5] font-semibold">◆ Top</span>
        )}
        {post.is_commented && (
          <span className="inline-flex items-center gap-1 text-emerald-700">
            <CheckCircle2 className="h-2.5 w-2.5" />
            replied
          </span>
        )}
        {post.is_liked && (
          <span
            className="inline-flex items-center gap-1 text-rose-600"
            title={post.liked_at ? `Liked ${new Date(post.liked_at).toLocaleString()}` : undefined}
          >
            <Heart className="h-2.5 w-2.5 fill-current" />
            liked
          </span>
        )}
        {post.published_at && (
          <span title={`Posted ${new Date(post.published_at).toLocaleString()}`}>
            {new Date(post.published_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' })}
            <span className="ml-1 text-muted-foreground/60 normal-case tracking-normal font-sans">
              · {timeAgo(post.published_at)}
            </span>
          </span>
        )}
        <span className="ml-auto inline-flex items-center gap-3 tabular-nums text-foreground/70 normal-case tracking-normal font-sans text-[11px]">
          <span title="Likes" className="inline-flex items-center gap-1">
            <ThumbsUp className="h-3 w-3 text-muted-foreground" />
            {post.likes_count.toLocaleString()}
          </span>
          <span title="Comments" className="inline-flex items-center gap-1">
            <MessageSquare className="h-3 w-3 text-muted-foreground" />
            {post.comments_count.toLocaleString()}
          </span>
          <span title="Shares" className="inline-flex items-center gap-1">
            <Share2 className="h-3 w-3 text-muted-foreground" />
            {post.shares_count.toLocaleString()}
          </span>
          <a
            href={post.linkedin_post_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-5 w-5 rounded text-muted-foreground hover:text-[#0A66C2] hover:bg-[#0A66C2]/10 transition-colors"
            title="Open on LinkedIn"
            onClick={(e) => e.stopPropagation()}
          >
            <ExternalLink className="h-3 w-3" />
          </a>
        </span>
      </div>

      {/* content */}
      {post.content ? (
        <div>
          <p
            className={cn(
              'text-[13px] leading-[1.5] text-foreground/90 whitespace-pre-wrap',
              !expanded && 'line-clamp-3',
            )}
          >
            {post.content}
          </p>
          {post.content.length > 220 && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[11px] text-[#4f46e5] hover:underline font-medium"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground italic">Media post (image / video / document)</p>
      )}

      {/* reply badge */}
      {post.is_commented && topComment && (
        <div className="mt-1.5 inline-flex items-center gap-1.5 text-[11px]">
          <span className="text-emerald-700 font-mono uppercase tracking-wider text-[10px]">your reply</span>
          <CommentEngagementPopover
            engagementCommentId={topComment.id}
            reactionCount={reactions}
            replyCount={replies}
            commentText={topComment.comment_text}
            postedAt={topComment.posted_at}
          />
        </div>
      )}

      {/* actions */}
      {isAdmin && (
        <div className="flex items-center gap-1.5 mt-2">
          <button
            type="button"
            disabled={isLiking || post.is_liked}
            onClick={onLike}
            className={cn(
              'inline-flex items-center gap-1 h-6 px-2 rounded-sm text-[11px] font-medium border transition-colors',
              post.is_liked
                ? 'text-rose-700 bg-rose-50 border-rose-200 cursor-default'
                : 'text-foreground/70 border-border bg-white hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200',
            )}
          >
            {isLiking ? (
              <Loader2 className="h-3 w-3 animate-spin" />
            ) : (
              <Heart className={cn('h-3 w-3', post.is_liked && 'fill-current')} />
            )}
            {post.is_liked ? 'Liked' : 'Like'}
          </button>
          <button
            type="button"
            onClick={onEngage}
            className={cn(
              'inline-flex items-center gap-1 h-6 px-2.5 rounded-sm text-[11px] font-semibold border transition-colors',
              'bg-[#4f46e5] text-white border-[#4f46e5] hover:bg-[#4338ca] hover:border-[#4338ca]',
            )}
          >
            <MessageCircle className="h-3 w-3" />
            {post.is_commented ? 'Reply again' : 'Engage'}
          </button>
        </div>
      )}
    </li>
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
    <div className="flex items-center justify-center py-16">
      <div className="text-center max-w-sm px-6">
        <div className="h-10 w-10 mx-auto rounded-sm bg-muted border border-border flex items-center justify-center mb-3">
          <Sparkles className="h-4 w-4 text-muted-foreground" />
        </div>
        <p className="font-semibold text-[13px] text-foreground">No posts yet</p>
        <p className="text-[12px] text-muted-foreground mt-0.5 mb-3">
          Sync to pull the latest LinkedIn activity from{' '}
          <span className="text-foreground/80 font-medium">{targetName}</span>.
        </p>
        {isAdmin && (
          <Button
            size="sm"
            onClick={onFetch}
            disabled={isFetching}
            className="h-7 gap-1.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white border-0 text-[11px] rounded-sm"
          >
            {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
            Sync now
          </Button>
        )}
      </div>
    </div>
  );
}


