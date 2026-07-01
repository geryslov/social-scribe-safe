import { useEffect, useMemo, useState } from 'react';
import { Navigate, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useWorkspaces } from '@/hooks/useWorkspaces';
import { useWorkspacePermissions } from '@/hooks/useWorkspacePermissions';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { useEngagementTargets, EngagementTarget, useLikePost } from '@/hooks/useEngagement';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { useEngagementSync, getNextScheduledSync } from '@/hooks/useEngagementSync';
import {
  useDiscoveredPosts, useAutoLikeHistory, usePublisherComments,
  useEngagementSyncRuns, DiscoveredPost,
} from '@/hooks/useEngagementActivity';
import { CommentComposer } from '@/components/engagement/CommentComposer';
import type { EngagementPost } from '@/hooks/useEngagement';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuTrigger, DropdownMenuSeparator, DropdownMenuLabel,
} from '@/components/ui/dropdown-menu';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import {
  FileText, BarChart3, FolderKanban, Sparkles, MessageSquareHeart,
  ShieldCheck, HelpCircle, PanelLeftClose, PanelLeftOpen,
  Search, Bell, RefreshCw, Loader2, ChevronDown, Check,
  Heart, MessageCircle, TrendingUp, AlertTriangle, ArrowRight,
  ExternalLink, MoreHorizontal, Filter, ArrowUpDown, Rows3, Rows2,
  Clock, CheckCircle2, XCircle, EyeOff, BookmarkPlus, Users, Plus, UserPlus,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export type FolderScope = 'all' | 'unfiled' | string;

const DAILY_CAP = 39;

/* ============================================================================
 * Root
 * ==========================================================================*/
export default function Engagement() {
  const { user } = useAuth();
  const { publishers } = usePublishers();
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null);
  
  const [tab, setTab] = useState<'overview' | 'activity' | 'rules' | 'history'>('activity');
  const [reviewTarget, setReviewTarget] = useState<ReviewRow | null>(null);
  const [composerPost, setComposerPost] = useState<EngagementPost | null>(null);

  useEffect(() => {
    if (!selectedPublisherId && publishers.length) setSelectedPublisherId(publishers[0].id);
  }, [publishers, selectedPublisherId]);

  if (!user) return <Navigate to="/auth" replace />;

  const selectedPublisher = publishers.find((p) => p.id === selectedPublisherId) || null;

  return (
    <div className="w-full">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-8 py-6 space-y-6">
        <PageHeader
          tab={tab}
          onTabChange={setTab}
          publisher={selectedPublisher}
          publishers={publishers}
          onSelectPublisher={setSelectedPublisherId}
          onOpenFirstReview={() => {
            document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' });
          }}
        />

        {tab === 'activity' && selectedPublisher && (
          <ActivityDashboard
            publisher={selectedPublisher}
            onOpenReview={setReviewTarget}
            onOpenComment={setComposerPost}
          />
        )}
        {tab === 'overview' && <ComingSoon label="Overview" />}
        {tab === 'rules' && <ComingSoon label="Rules" />}
        {tab === 'history' && <ComingSoon label="History" />}

        {!selectedPublisher && (
          <div className="rounded-[14px] border border-[#E5E7ED] bg-white p-10 text-center text-sm text-[#667085]">
            No publishers in this workspace yet.
          </div>
        )}
      </div>

      {/* Review drawer */}
      <Sheet open={!!reviewTarget} onOpenChange={(o) => !o && setReviewTarget(null)}>
        <SheetContent side="right" className="w-[420px] sm:max-w-[420px] p-0 bg-white border-l border-[#E5E7ED]">
          {reviewTarget && (
            <ReviewDrawer
              row={reviewTarget}
              publisher={selectedPublisher}
              onClose={() => setReviewTarget(null)}
              onOpenComment={(p) => { setComposerPost(p); }}
            />
          )}
        </SheetContent>
      </Sheet>

      {/* Comment composer */}
      <Sheet open={!!composerPost} onOpenChange={(o) => !o && setComposerPost(null)}>
        <SheetContent side="bottom" className="max-w-[720px] mx-auto rounded-t-2xl border-t border-[#E5E7ED] p-0 max-h-[80vh] overflow-hidden flex flex-col">
          {composerPost && selectedPublisher && (
            <>
              <SheetHeader className="px-5 py-3 border-b border-[#E5E7ED]">
                <SheetTitle className="text-sm font-semibold">Comment on post</SheetTitle>
                <SheetDescription className="text-xs text-[#667085]">
                  Draft, generate, or post directly to LinkedIn.
                </SheetDescription>
              </SheetHeader>
              <div className="flex-1 overflow-y-auto p-5">
                <CommentComposer
                  post={composerPost}
                  publisher={selectedPublisher}
                  onClose={() => setComposerPost(null)}
                />
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}





/* ============================================================================
 * Page Header — title + tabs + actions
 * ==========================================================================*/
function PageHeader({
  tab, onTabChange, publisher, publishers, onSelectPublisher, onOpenFirstReview,
}: {
  tab: 'overview' | 'activity' | 'rules' | 'history';
  onTabChange: (t: any) => void;
  publisher: Publisher | null;
  publishers: Publisher[];
  onSelectPublisher: (id: string) => void;
  onOpenFirstReview: () => void;
}) {
  const { runNow } = useEngagementSync();
  const { data: discovered = [] } = useDiscoveredPosts(publisher?.id ?? null, 7);
  const reviewCount = discovered.filter((p) => !p.is_liked && !p.is_commented).length;
  const [addOpen, setAddOpen] = useState(false);

  const runSync = () => {
    if (!publisher) return;
    window.dispatchEvent(new CustomEvent('engagement:sync-all', { detail: { publisherId: publisher.id } }));
    runNow.mutate();
    toast.info('Sync started…');
  };


  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-6 flex-wrap">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] leading-tight font-semibold tracking-tight">Engage</h1>
            {publisher && (
              <PublisherPill publisher={publisher} publishers={publishers} onSelect={onSelectPublisher} />
            )}
          </div>
          <p className="text-sm text-[#667085] mt-1">
            Review discovered content and manage engagement activity.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setAddOpen(true)}
            disabled={!publisher}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] active:bg-[#EEF0F5] text-sm font-medium text-[#171923] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Add profile
          </button>
          <button
            type="button"
            onClick={runSync}
            disabled={runNow.isPending}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] active:bg-[#EEF0F5] text-sm font-medium text-[#171923] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {runNow.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
            Manual sync
          </button>
          <button
            type="button"
            onClick={onOpenFirstReview}
            disabled={reviewCount === 0}
            className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] active:bg-[#5B21B6] text-white text-sm font-medium shadow-sm shadow-[#7C3AED]/20 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Review {reviewCount} post{reviewCount === 1 ? '' : 's'}
            <ArrowRight className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      {publisher && (
        <AddProfileDialog
          open={addOpen}
          onOpenChange={setAddOpen}
          publisher={publisher}
        />
      )}


      {/* Tabs */}
      <div className="border-b border-[#E5E7ED]" role="tablist" aria-label="Engage sections">
        <div className="flex items-center gap-1">
          {(['overview', 'activity', 'rules', 'history'] as const).map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => onTabChange(t)}
              className={cn(
                'relative h-10 px-3.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 rounded-t-md',
                tab === t ? 'text-[#171923]' : 'text-[#667085] hover:text-[#171923]',
              )}
            >
              <span className="capitalize">{t}</span>
              {tab === t && <span className="absolute left-0 right-0 -bottom-px h-0.5 bg-[#7C3AED] rounded-full" />}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function PublisherPill({
  publisher, publishers, onSelect,
}: { publisher: Publisher; publishers: Publisher[]; onSelect: (id: string) => void }) {
  const initials = publisher.name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <Popover>
      <PopoverTrigger className="inline-flex items-center gap-2 h-7 pl-1 pr-2 rounded-full border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40">
        <Avatar url={publisher.avatar_url} name={publisher.name} size={20} />
        <span className="text-xs font-medium text-[#171923]">{publisher.name}</span>
        <ChevronDown className="h-3 w-3 text-[#667085]" />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="text-[10px] uppercase tracking-wider text-[#667085] px-2 py-1.5">Publisher</div>
        {publishers.map((p) => (
          <button
            key={p.id}
            onClick={() => onSelect(p.id)}
            className={cn(
              'w-full flex items-center gap-2.5 px-2 py-1.5 rounded-md text-left transition-colors',
              p.id === publisher.id ? 'bg-[#F4F0FF]' : 'hover:bg-[#F7F8FB]',
            )}
          >
            <Avatar url={p.avatar_url} name={p.name} size={24} />
            <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
            {p.id === publisher.id && <Check className="h-3.5 w-3.5 text-[#7C3AED]" />}
          </button>
        ))}
      </PopoverContent>
    </Popover>
  );
}

/* ============================================================================
 * Activity Dashboard
 * ==========================================================================*/
type ReviewRow = {
  id: string;
  name: string;
  avatar_url: string | null;
  title: string | null;
  company: string | null;
  linkedin_url: string | null;
  new_posts: number;
  last_post_at: string | null;
  priority: 'high' | 'medium' | 'low';
  posts: DiscoveredPost[];
};

function ActivityDashboard({
  publisher, onOpenReview, onOpenComment,
}: {
  publisher: Publisher;
  onOpenReview: (row: ReviewRow) => void;
  onOpenComment: (post: EngagementPost) => void;
}) {
  const { targets } = useEngagementTargets(publisher.id);
  const { data: discovered = [], isLoading: discoveredLoading } = useDiscoveredPosts(publisher.id, 7);
  const { data: likes = [] } = useAutoLikeHistory(publisher.id, 1);
  const { data: comments = [] } = usePublisherComments(publisher.id, 1);
  const { lastRun } = useEngagementSync();

  const [queueTab, setQueueTab] = useState<'review' | 'all' | 'engaged' | 'dismissed'>('review');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'relevance' | 'new_posts' | 'recent'>('relevance');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const likedToday = likes.filter((l) => l.status === 'liked').length;
  const failedToday = likes.filter((l) => l.status === 'failed').length;
  const commentedToday = comments.length;
  const discoveredCount = discovered.length;

  // Build review rows
  const rows: ReviewRow[] = useMemo(() => {
    const byTarget = new Map<string, ReviewRow>();
    for (const p of discovered) {
      const existing = byTarget.get(p.target_id);
      if (existing) {
        existing.posts.push(p);
        existing.new_posts++;
        if (!existing.last_post_at || (p.created_at > existing.last_post_at)) existing.last_post_at = p.created_at;
      } else {
        byTarget.set(p.target_id, {
          id: p.target_id,
          name: p.target_name || 'Unknown',
          avatar_url: p.target_avatar_url,
          title: p.target_title,
          company: p.target_company,
          linkedin_url: p.target_linkedin_url,
          new_posts: 1,
          last_post_at: p.created_at,
          priority: 'medium',
          posts: [p],
        });
      }
    }
    // Compute priority from post reach
    for (const r of byTarget.values()) {
      const reach = r.posts.reduce((a, b) => a + (b.likes_count || 0) + (b.comments_count || 0) * 3, 0);
      r.priority = reach > 100 ? 'high' : reach > 20 ? 'medium' : 'low';
    }
    return [...byTarget.values()];
  }, [discovered]);

  const profilesWithNew = rows.length;
  const profilesChecked = lastRun?.synced ?? 0;
  const totalProfiles = lastRun?.total_targets ?? targets.length;
  const nextSync = getNextScheduledSync();
  const minsUntil = Math.max(0, Math.floor((nextSync.getTime() - Date.now()) / 60_000));
  const nextLabel = minsUntil > 60 ? `${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m` : `${minsUntil}m`;

  const filteredRows = useMemo(() => {
    let out = rows;
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((r) => r.name.toLowerCase().includes(q) || (r.company || '').toLowerCase().includes(q));
    if (queueTab === 'engaged') out = out.filter((r) => r.posts.some((p) => p.is_liked || p.is_commented));
    if (queueTab === 'review') out = out.filter((r) => r.posts.some((p) => !p.is_liked && !p.is_commented));
    // 'all' and 'dismissed' — dismissed not tracked yet, show empty later
    if (queueTab === 'dismissed') out = [];
    if (sort === 'new_posts') out = [...out].sort((a, b) => b.new_posts - a.new_posts);
    else if (sort === 'recent') out = [...out].sort((a, b) => (b.last_post_at || '').localeCompare(a.last_post_at || ''));
    else out = [...out].sort((a, b) => {
      const pr = { high: 3, medium: 2, low: 1 };
      return pr[b.priority] - pr[a.priority] || b.new_posts - a.new_posts;
    });
    return out;
  }, [rows, query, queueTab, sort]);

  const hasEngagement = likedToday + commentedToday > 0;

  return (
    <div className="space-y-6">
      {/* System status bar */}
      <div className="rounded-[14px] border border-[#E5E7ED] bg-white px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <StatusChip icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
          label={<><b className="text-[#171923] font-semibold">{profilesChecked}</b> of <b className="text-[#171923] font-semibold">{totalProfiles}</b> profiles checked</>} />
        <div className="h-4 w-px bg-[#E5E7ED]" />
        <StatusChip icon={<Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />}
          label={<><b className="text-[#171923] font-semibold">{discoveredCount}</b> new posts discovered</>} />
        <div className="h-4 w-px bg-[#E5E7ED]" />
        <StatusChip icon={<Clock className="h-3.5 w-3.5 text-[#667085]" />}
          label={<>Next sync in <b className="text-[#171923] font-semibold tabular-nums">{nextLabel}</b></>} />
        <div className="flex-1" />
        <div className="flex items-center gap-2 text-xs text-[#667085]">
          <span>Daily auto-like usage</span>
          <div className="w-32 h-1.5 rounded-full bg-[#EEF0F5] overflow-hidden" aria-label="Daily usage" role="progressbar" aria-valuenow={likedToday} aria-valuemin={0} aria-valuemax={DAILY_CAP}>
            <div
              className={cn('h-full rounded-full transition-all', likedToday >= DAILY_CAP ? 'bg-[#7C3AED]' : 'bg-[#7C3AED]/70')}
              style={{ width: `${Math.min(100, (likedToday / DAILY_CAP) * 100)}%` }}
            />
          </div>
          <span className="tabular-nums font-semibold text-[#171923]">{likedToday} of {DAILY_CAP}</span>
        </div>
      </div>

      {/* Smart summary */}
      {discoveredCount > 0 && (
        <div className="rounded-[14px] border border-[#E5E7ED] bg-gradient-to-br from-white to-[#FBFAFF] p-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-[#F4F0FF] text-[#7C3AED] flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[#171923] leading-relaxed">
                <b>{discoveredCount} new posts</b> were discovered across <b>{profilesWithNew} profiles</b>.
                {!hasEngagement && <> No engagement actions have been completed today.</>}
              </div>
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' })}
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
                >
                  Review priority posts <ArrowRight className="h-3 w-3" />
                </button>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 h-8 px-3 rounded-md border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] text-xs font-medium text-[#171923] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
                >
                  View details
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* KPI cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          primary
          label="New posts"
          value={discoveredCount}
          sub={`from ${profilesWithNew} profile${profilesWithNew === 1 ? '' : 's'}`}
          icon={<TrendingUp className="h-4 w-4" />}
        />
        <KpiCard label="Likes completed" value={likedToday} sub="today" icon={<Heart className="h-4 w-4" />} />
        <KpiCard label="Comments completed" value={commentedToday} sub="today" icon={<MessageCircle className="h-4 w-4" />} />
        <KpiCard
          label="Failures"
          value={failedToday}
          sub={failedToday === 0 ? 'no issues detected' : 'need attention'}
          icon={<AlertTriangle className="h-4 w-4" />}
          warn={failedToday > 0}
        />
      </div>

      {/* Activity chart / empty state */}
      <section className="rounded-[14px] border border-[#E5E7ED] bg-white overflow-hidden" aria-label="Engagement activity">
        <div className="px-5 py-3 border-b border-[#E5E7ED] flex items-center justify-between">
          <div>
            <h2 className="text-sm font-semibold text-[#171923]">Engagement activity</h2>
            <p className="text-xs text-[#667085] mt-0.5">Last 7 days</p>
          </div>
          {hasEngagement && (
            <div className="inline-flex rounded-md border border-[#E5E7ED] p-0.5 text-xs">
              <button className="px-2.5 py-1 rounded-sm bg-[#F4F0FF] text-[#7C3AED] font-medium">Chart</button>
              <button className="px-2.5 py-1 rounded-sm text-[#667085] hover:text-[#171923]">Table</button>
            </div>
          )}
        </div>
        {hasEngagement ? (
          <ActivitySpark likes={likedToday} comments={commentedToday} />
        ) : (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-xl bg-[#F4F0FF] text-[#7C3AED] flex items-center justify-center mb-3">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-[#171923]">No engagement activity yet</h3>
            <p className="text-sm text-[#667085] mt-1 max-w-md">
              Nothing has been liked or commented on during this period. <b className="text-[#171923]">{discoveredCount}</b> newly discovered posts are ready to review.
            </p>
            <div className="mt-4 flex items-center gap-2">
              <button
                type="button"
                onClick={() => document.getElementById('review-queue')?.scrollIntoView({ behavior: 'smooth' })}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
              >
                Review new posts
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] text-sm font-medium text-[#171923] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
              >
                Configure engagement rules
              </button>
            </div>
          </div>
        )}
      </section>

      {/* Review queue */}
      <section id="review-queue" className="rounded-[14px] border border-[#E5E7ED] bg-white overflow-hidden">
        <div className="px-5 pt-4 pb-3 border-b border-[#E5E7ED]">
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-sm font-semibold text-[#171923]">Review queue</h2>
              <p className="text-xs text-[#667085] mt-0.5">Profiles with new activity worth your attention.</p>
            </div>
          </div>
          <div className="mt-3 flex items-center gap-2 flex-wrap">
            <div className="inline-flex rounded-lg border border-[#E5E7ED] p-0.5 text-xs" role="tablist">
              {([
                ['review', `Needs review`],
                ['all', 'All discovered'],
                ['engaged', 'Engaged'],
                ['dismissed', 'Dismissed'],
              ] as const).map(([id, label]) => (
                <button
                  key={id}
                  role="tab"
                  aria-selected={queueTab === id}
                  onClick={() => setQueueTab(id)}
                  className={cn(
                    'px-2.5 h-7 rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40',
                    queueTab === id ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'text-[#667085] hover:text-[#171923]',
                  )}
                >
                  {label}
                </button>
              ))}
            </div>
            <div className="flex-1" />
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-[#667085]" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search profiles"
                className="h-8 pl-8 text-xs w-52 border-[#E5E7ED] bg-white"
                aria-label="Search profiles"
              />
            </div>
            <button className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-[#E5E7ED] bg-white text-xs font-medium text-[#171923] hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40" aria-label="Filters">
              <Filter className="h-3.5 w-3.5" /> Filters
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger className="inline-flex items-center gap-1.5 h-8 px-2.5 rounded-md border border-[#E5E7ED] bg-white text-xs font-medium text-[#171923] hover:bg-[#F7F8FB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40" aria-label="Sort">
                <ArrowUpDown className="h-3.5 w-3.5" /> Sort: {sort === 'relevance' ? 'Relevance' : sort === 'new_posts' ? 'New posts' : 'Recent'}
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setSort('relevance')}>Relevance</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort('new_posts')}>New posts</DropdownMenuItem>
                <DropdownMenuItem onClick={() => setSort('recent')}>Most recent</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
            <div className="inline-flex rounded-md border border-[#E5E7ED] p-0.5" role="group" aria-label="Row density">
              <button
                onClick={() => setDensity('comfortable')}
                aria-pressed={density === 'comfortable'}
                aria-label="Comfortable"
                className={cn('h-7 w-7 flex items-center justify-center rounded-sm', density === 'comfortable' ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'text-[#667085] hover:text-[#171923]')}
              ><Rows3 className="h-3.5 w-3.5" /></button>
              <button
                onClick={() => setDensity('compact')}
                aria-pressed={density === 'compact'}
                aria-label="Compact"
                className={cn('h-7 w-7 flex items-center justify-center rounded-sm', density === 'compact' ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'text-[#667085] hover:text-[#171923]')}
              ><Rows2 className="h-3.5 w-3.5" /></button>
            </div>
          </div>
        </div>

        {/* Table */}
        {discoveredLoading ? (
          <div className="p-10 text-center text-sm text-[#667085]">Loading queue…</div>
        ) : filteredRows.length === 0 ? (
          <QueueEmpty tab={queueTab} />
        ) : (
          <div role="table" aria-label="Profiles to review">
            <div role="row" className="grid grid-cols-[minmax(0,1fr)_120px_120px_160px_140px] gap-4 px-5 h-9 items-center bg-[#F7F8FB] border-b border-[#E5E7ED] text-[11px] uppercase tracking-wider text-[#667085] font-medium">
              <div>Profile</div>
              <div className="text-right">New posts</div>
              <div>Priority</div>
              <div>Last checked</div>
              <div className="text-right">Action</div>
            </div>
            <div className="divide-y divide-[#E5E7ED]">
              {filteredRows.map((r) => (
                <QueueRow key={r.id} row={r} density={density} onOpen={() => onOpenReview(r)} onComment={(p) => onOpenComment(p)} />
              ))}
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

/* ============================================================================
 * Sub-components
 * ==========================================================================*/

function StatusChip({ icon, label }: { icon: React.ReactNode; label: React.ReactNode }) {
  return (
    <div className="inline-flex items-center gap-2 text-xs text-[#667085]">
      {icon}
      <span>{label}</span>
    </div>
  );
}

function KpiCard({
  primary, label, value, sub, icon, warn,
}: { primary?: boolean; label: string; value: number; sub?: string; icon: React.ReactNode; warn?: boolean }) {
  return (
    <div
      className={cn(
        'rounded-[14px] border p-4 transition-colors',
        primary
          ? 'border-[#E4DAFB] bg-[#FBFAFF]'
          : 'border-[#E5E7ED] bg-white',
      )}
    >
      <div className="flex items-center justify-between">
        <div className={cn(
          'h-7 w-7 rounded-md flex items-center justify-center',
          primary ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'bg-[#F7F8FB] text-[#667085]',
          warn && 'bg-[#FFF7ED] text-[#B45309]',
        )}>
          {icon}
        </div>
      </div>
      <div className="mt-2.5 text-[26px] leading-none font-semibold tracking-tight text-[#171923] tabular-nums">
        {value}
      </div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-xs font-medium text-[#171923]">{label}</span>
        {sub && <span className="text-[11px] text-[#667085]">{sub}</span>}
      </div>
    </div>
  );
}

function ActivitySpark({ likes, comments }: { likes: number; comments: number }) {
  // Minimal 7-bar mock derived from today's counts
  const bars = Array.from({ length: 7 }, (_, i) => (i === 6 ? likes + comments : Math.max(0, Math.round((likes + comments) * (0.2 + i * 0.05)))));
  const max = Math.max(1, ...bars);
  return (
    <div className="px-5 py-6">
      <div className="flex items-end gap-2 h-40">
        {bars.map((v, i) => (
          <div key={i} className="flex-1 flex flex-col items-center gap-1.5">
            <div
              className={cn('w-full rounded-t-md bg-gradient-to-t from-[#7C3AED] to-[#A78BFA] transition-all', v === 0 && 'from-[#EEF0F5] to-[#F4F0FF]')}
              style={{ height: `${(v / max) * 100}%`, minHeight: 4 }}
            />
            <span className="text-[10px] font-mono text-[#667085]">{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i]}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueEmpty({ tab }: { tab: string }) {
  const label = tab === 'engaged' ? 'No engagement yet in this range.' : tab === 'dismissed' ? 'No dismissed profiles.' : 'Nothing to review right now.';
  return (
    <div className="p-10 flex flex-col items-center text-center">
      <div className="h-10 w-10 rounded-lg bg-[#F7F8FB] text-[#667085] flex items-center justify-center mb-2">
        <Users className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-[#171923]">All clear</h3>
      <p className="text-xs text-[#667085] mt-1">{label}</p>
    </div>
  );
}

function QueueRow({
  row, density, onOpen, onComment,
}: { row: ReviewRow; density: 'comfortable' | 'compact'; onOpen: () => void; onComment: (p: EngagementPost) => void }) {
  const rowH = density === 'compact' ? 'h-14' : 'h-[68px]';
  const priorityStyles: Record<ReviewRow['priority'], string> = {
    high: 'bg-[#F4F0FF] text-[#7C3AED] border-[#E4DAFB]',
    medium: 'bg-[#F7F8FB] text-[#3F4657] border-[#E5E7ED]',
    low: 'bg-white text-[#667085] border-[#E5E7ED]',
  };
  const priorityLabel = { high: 'High', medium: 'Medium', low: 'Low' }[row.priority];
  return (
    <div
      role="row"
      className={cn(
        'grid grid-cols-[minmax(0,1fr)_120px_120px_160px_140px] gap-4 px-5 items-center hover:bg-[#F7F8FB] transition-colors group',
        rowH,
      )}
    >
      <button onClick={onOpen} className="flex items-center gap-3 min-w-0 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40 rounded-md">
        <Avatar url={row.avatar_url} name={row.name} size={36} />
        <div className="min-w-0">
          <div className="text-sm font-medium text-[#171923] truncate">{row.name}</div>
          <div className="text-xs text-[#667085] truncate">
            {[row.title, row.company].filter(Boolean).join(' · ') || 'LinkedIn profile'}
          </div>
        </div>
      </button>

      <div className="text-right">
        <span className="inline-flex items-center h-6 px-2 rounded-full bg-[#F4F0FF] text-[#7C3AED] text-xs font-semibold tabular-nums">
          {row.new_posts}
        </span>
      </div>

      <div>
        <span className={cn('inline-flex items-center h-6 px-2 rounded-full border text-xs font-medium', priorityStyles[row.priority])}>
          {priorityLabel}
        </span>
      </div>

      <div className="text-xs text-[#667085] tabular-nums">
        {row.last_post_at ? relativeTime(row.last_post_at) : '—'}
      </div>

      <div className="flex items-center gap-1.5 justify-end">
        <button
          type="button"
          onClick={onOpen}
          className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-white border border-[#E5E7ED] hover:bg-[#F4F0FF] hover:border-[#E4DAFB] hover:text-[#7C3AED] text-xs font-medium text-[#171923] transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
        >
          Review
        </button>
        <DropdownMenu>
          <DropdownMenuTrigger aria-label="More actions" className="h-8 w-8 rounded-md text-[#667085] hover:bg-white hover:text-[#171923] flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40">
            <MoreHorizontal className="h-4 w-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => row.posts[0] && onComment(row.posts[0] as any)}>
              <MessageCircle className="h-3.5 w-3.5 mr-2" /> Comment on latest
            </DropdownMenuItem>
            {row.linkedin_url && (
              <DropdownMenuItem asChild>
                <a href={row.linkedin_url} target="_blank" rel="noreferrer">
                  <ExternalLink className="h-3.5 w-3.5 mr-2" /> Open on LinkedIn
                </a>
              </DropdownMenuItem>
            )}
            <DropdownMenuSeparator />
            <DropdownMenuItem>
              <BookmarkPlus className="h-3.5 w-3.5 mr-2" /> Save for later
            </DropdownMenuItem>
            <DropdownMenuItem>
              <EyeOff className="h-3.5 w-3.5 mr-2" /> Dismiss
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

/* ============================================================================
 * Review Drawer
 * ==========================================================================*/
function ReviewDrawer({
  row, publisher, onClose, onOpenComment,
}: { row: ReviewRow; publisher: Publisher | null; onClose: () => void; onOpenComment: (p: EngagementPost) => void }) {
  const likeMutation = useLikePost();
  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-5 border-b border-[#E5E7ED]">
        <div className="flex items-start gap-3">
          <Avatar url={row.avatar_url} name={row.name} size={48} />
          <div className="flex-1 min-w-0">
            <div className="text-base font-semibold text-[#171923] truncate">{row.name}</div>
            <div className="text-xs text-[#667085] truncate">
              {[row.title, row.company].filter(Boolean).join(' · ') || 'LinkedIn profile'}
            </div>
            {row.linkedin_url && (
              <a href={row.linkedin_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-xs text-[#7C3AED] hover:underline">
                Open on LinkedIn <ExternalLink className="h-3 w-3" />
              </a>
            )}
          </div>
        </div>
        <div className="mt-4 flex items-center gap-2 text-xs">
          <span className="inline-flex items-center h-6 px-2 rounded-full bg-[#F4F0FF] text-[#7C3AED] font-semibold">
            {row.new_posts} new post{row.new_posts === 1 ? '' : 's'}
          </span>
          <span className={cn(
            'inline-flex items-center h-6 px-2 rounded-full border font-medium',
            row.priority === 'high' ? 'bg-[#F4F0FF] text-[#7C3AED] border-[#E4DAFB]' : 'bg-[#F7F8FB] text-[#3F4657] border-[#E5E7ED]',
          )}>
            {row.priority === 'high' ? 'High priority' : row.priority === 'medium' ? 'Medium priority' : 'Low priority'}
          </span>
        </div>
      </div>

      {/* Relevance explanation */}
      <div className="px-5 py-3 border-b border-[#E5E7ED] bg-[#FBFAFF]">
        <div className="flex items-start gap-2">
          <Sparkles className="h-3.5 w-3.5 text-[#7C3AED] mt-0.5 flex-shrink-0" />
          <p className="text-xs text-[#3F4657] leading-relaxed">
            Ranked <b className="text-[#171923]">{row.priority}</b> because their recent posts are getting notable reach
            ({row.posts.reduce((a, b) => a + (b.likes_count || 0), 0)} likes across {row.new_posts} posts).
            Engaging early can lift visibility for {publisher?.name || 'your publisher'}.
          </p>
        </div>
      </div>

      {/* Post previews */}
      <div className="flex-1 overflow-y-auto px-5 py-4 space-y-3">
        <div className="text-[11px] uppercase tracking-wider text-[#667085] font-medium">Recent posts</div>
        {row.posts.map((p) => (
          <article key={p.id} className="rounded-[14px] border border-[#E5E7ED] bg-white p-3.5">
            <div className="flex items-center gap-2 text-[11px] text-[#667085]">
              <span className="tabular-nums">{relativeTime(p.created_at)}</span>
              <span>·</span>
              <span className="tabular-nums">{p.likes_count} likes</span>
              <span>·</span>
              <span className="tabular-nums">{p.comments_count} comments</span>
              {p.linkedin_post_url && (
                <a href={p.linkedin_post_url} target="_blank" rel="noreferrer" className="ml-auto text-[#7C3AED] hover:underline inline-flex items-center gap-0.5">
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
            <p className="mt-2 text-sm text-[#171923] leading-relaxed line-clamp-4">
              {p.content || '—'}
            </p>
            {/* Suggested engagement */}
            <div className="mt-3 rounded-md bg-[#FBFAFF] border border-[#E4DAFB] px-3 py-2">
              <div className="text-[10px] uppercase tracking-wider text-[#7C3AED] font-medium">Suggested</div>
              <p className="text-xs text-[#3F4657] mt-0.5">
                Add a specific reaction — reference the outcome they shared and add a first-hand angle.
              </p>
            </div>
            <div className="mt-3 flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                disabled={p.is_liked || likeMutation.isPending || !publisher}
                onClick={() => publisher && likeMutation.mutate({ publisher_id: publisher.id, post_id: p.id })}
                className={cn(
                  'inline-flex items-center gap-1 h-8 px-3 rounded-md text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40',
                  p.is_liked
                    ? 'bg-rose-50 text-rose-600 border border-rose-200 cursor-default'
                    : 'bg-white border border-[#E5E7ED] hover:bg-[#F7F8FB] text-[#171923]',
                )}
              >
                <Heart className={cn('h-3.5 w-3.5', p.is_liked && 'fill-rose-500 text-rose-500')} />
                {p.is_liked ? 'Liked' : 'Like'}
              </button>
              <button
                type="button"
                onClick={() => onOpenComment(p as any)}
                className="inline-flex items-center gap-1 h-8 px-3 rounded-md bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
              >
                <MessageCircle className="h-3.5 w-3.5" /> Comment
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] text-xs font-medium text-[#667085]"
              >
                <BookmarkPlus className="h-3.5 w-3.5" /> Save
              </button>
              <button
                type="button"
                className="inline-flex items-center gap-1 h-8 px-2.5 rounded-md border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] text-xs font-medium text-[#667085]"
              >
                <EyeOff className="h-3.5 w-3.5" /> Dismiss
              </button>
            </div>
          </article>
        ))}

        {/* Activity history */}
        <div className="pt-4 border-t border-[#E5E7ED]">
          <div className="text-[11px] uppercase tracking-wider text-[#667085] font-medium mb-2">Activity history</div>
          <div className="space-y-1.5">
            {row.posts.filter((p) => p.is_liked || p.is_commented).length === 0 ? (
              <p className="text-xs text-[#667085]">No engagement history with this profile yet.</p>
            ) : (
              row.posts.filter((p) => p.is_liked || p.is_commented).map((p) => (
                <div key={`h-${p.id}`} className="text-xs flex items-center gap-2">
                  {p.is_liked && <span className="inline-flex items-center gap-1 text-rose-600"><Heart className="h-3 w-3 fill-rose-500" /> Liked</span>}
                  {p.is_commented && <span className="inline-flex items-center gap-1 text-[#7C3AED]"><MessageCircle className="h-3 w-3" /> Commented</span>}
                  <span className="text-[#667085] tabular-nums">{p.liked_at ? relativeTime(p.liked_at) : relativeTime(p.created_at)}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="p-4 border-t border-[#E5E7ED] flex items-center gap-2">
        <button onClick={onClose} className="flex-1 h-9 rounded-lg border border-[#E5E7ED] bg-white hover:bg-[#F7F8FB] text-sm font-medium text-[#171923] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40">
          Close
        </button>
      </div>
    </div>
  );
}

function ComingSoon({ label }: { label: string }) {
  return (
    <div className="rounded-[14px] border border-[#E5E7ED] bg-white p-10 text-center">
      <div className="h-10 w-10 rounded-lg bg-[#F4F0FF] text-[#7C3AED] mx-auto flex items-center justify-center mb-3">
        <Sparkles className="h-5 w-5" />
      </div>
      <h3 className="text-sm font-semibold text-[#171923]">{label} coming soon</h3>
      <p className="text-xs text-[#667085] mt-1">Switch to Activity to review discovered posts.</p>
    </div>
  );
}

/* ============================================================================
 * Utilities
 * ==========================================================================*/
function Avatar({ url, name, size = 32 }: { url: string | null; name: string; size?: number }) {
  const initials = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div
      className="rounded-full overflow-hidden bg-[#F4F0FF] text-[#7C3AED] font-semibold flex items-center justify-center flex-shrink-0"
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size * 0.35)) }}
    >
      {url ? (
        <img src={url} alt={name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : initials}
    </div>
  );
}

function relativeTime(iso: string) {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const mins = Math.round(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.round(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}
