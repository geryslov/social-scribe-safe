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
import { Switch } from '@/components/ui/switch';
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
        <>
          <BulkAutomationToggles publisher={publisher} />
          <AddProfileDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            publisher={publisher}
          />
        </>
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
 * Bulk automation toggles (per-publisher)
 * ==========================================================================*/
function BulkAutomationToggles({ publisher }: { publisher: Publisher }) {
  const { targets, bulkUpdatePublisherTargets } = useEngagementTargets(publisher.id);

  const total = targets.length;
  const syncOn = targets.filter((t) => t.auto_sync !== false).length;
  const likeOn = targets.filter((t) => t.auto_like).length;
  const syncAllOn = total > 0 && syncOn === total;
  const syncMixed = syncOn > 0 && syncOn < total;
  const likeAllOn = total > 0 && likeOn === total;
  const likeMixed = likeOn > 0 && likeOn < total;

  const onSync = (checked: boolean) => {
    bulkUpdatePublisherTargets.mutate({ publisher_id: publisher.id, updates: { auto_sync: checked } });
  };
  const onLike = (checked: boolean) => {
    bulkUpdatePublisherTargets.mutate({ publisher_id: publisher.id, updates: { auto_like: checked } });
  };

  return (
    <div className="rounded-[14px] border border-[#E5E7ED] bg-white px-4 py-3 flex items-center gap-6 flex-wrap">
      <div className="text-xs text-[#667085]">
        Automation for <b className="text-[#171923] font-semibold">{publisher.name}</b>
        <span className="ml-1">· {total} profile{total === 1 ? '' : 's'}</span>
      </div>
      <div className="h-4 w-px bg-[#E5E7ED]" />
      <BulkToggleRow
        label="Auto-sync all"
        hint={syncMixed ? `${syncOn} of ${total} active` : syncAllOn ? 'Fetch new posts daily for every profile' : 'Paused — daily sync skips these profiles'}
        checked={syncAllOn}
        mixed={syncMixed}
        disabled={total === 0 || bulkUpdatePublisherTargets.isPending}
        onChange={onSync}
      />
      <BulkToggleRow
        label="Auto-like all"
        hint={likeMixed ? `${likeOn} of ${total} enabled` : likeAllOn ? 'Automatically like new posts from every profile' : 'Off — no posts will be auto-liked'}
        checked={likeAllOn}
        mixed={likeMixed}
        disabled={total === 0 || bulkUpdatePublisherTargets.isPending}
        onChange={onLike}
      />
    </div>
  );
}

function BulkToggleRow({
  label, hint, checked, mixed, disabled, onChange,
}: { label: string; hint: string; checked: boolean; mixed: boolean; disabled: boolean; onChange: (c: boolean) => void }) {
  return (
    <label className={cn('flex items-center gap-3 cursor-pointer select-none', disabled && 'cursor-not-allowed opacity-60')}>
      <Switch
        checked={checked}
        onCheckedChange={onChange}
        disabled={disabled}
        className={cn(mixed && 'data-[state=unchecked]:bg-[#F4F0FF] ring-2 ring-[#7C3AED]/30')}
      />
      <div className="min-w-0">
        <div className="text-sm font-medium text-[#171923] flex items-center gap-1.5">
          {label}
          {mixed && <span className="text-[10px] uppercase tracking-wider text-[#7C3AED] font-semibold">Mixed</span>}
        </div>
        <div className="text-[11px] text-[#667085]">{hint}</div>
      </div>
    </label>
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

type DailySyncRow = {
  key: string;
  label: string;
  date: Date;
  checked: number;
  total: number;
  newPosts: number;
  profilesWithNew: string[];
  recordedRuns: number;
  runNewPosts: number;
  failed: number;
  skipped: number;
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
  const { data: likes = [] } = useAutoLikeHistory(publisher.id, 7);
  const { data: comments = [] } = usePublisherComments(publisher.id, 7);
  const { data: syncRuns = [] } = useEngagementSyncRuns(20);

  const [queueTab, setQueueTab] = useState<'review' | 'all' | 'engaged' | 'dismissed'>('review');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<'relevance' | 'new_posts' | 'recent'>('relevance');
  const [density, setDensity] = useState<'comfortable' | 'compact'>('comfortable');

  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const likedToday = likes.filter((l) => l.status === 'liked' && new Date(l.run_at).getTime() >= todayStart).length;
  const failedToday = likes.filter((l) => l.status === 'failed' && new Date(l.run_at).getTime() >= todayStart).length;
  const commentedToday = comments.filter((c) => c.posted_at && new Date(c.posted_at).getTime() >= todayStart).length;
  const totalPosts = discovered.length;

  const activeTargets = useMemo(
    () => targets.filter((t) => t.is_active !== false),
    [targets],
  );

  const dailySyncRows: DailySyncRow[] = useMemo(() => {
    const base = startOfLocalDay(new Date());
    const rows = Array.from({ length: 7 }, (_, index) => {
      const date = new Date(base);
      date.setDate(date.getDate() - (6 - index));
      return {
        key: localDayKey(date),
        label: dailyLabel(date),
        date,
        checked: 0,
        total: activeTargets.length,
        newPosts: 0,
        profilesWithNew: new Set<string>(),
        recordedRuns: 0,
        runNewPosts: 0,
        failed: 0,
        skipped: 0,
      };
    });
    const byKey = new Map(rows.map((row) => [row.key, row]));

    for (const target of activeTargets) {
      if (!target.last_fetched_at) continue;
      const key = localDayKey(new Date(target.last_fetched_at));
      const row = byKey.get(key);
      if (row) row.checked += 1;
    }

    for (const post of discovered) {
      const key = localDayKey(new Date(post.created_at));
      const row = byKey.get(key);
      if (!row) continue;
      row.newPosts += 1;
      if (post.target_name) row.profilesWithNew.add(post.target_name);
    }

    const targetIdSet = new Set(activeTargets.map((t) => t.id));
    for (const run of syncRuns) {
      const key = localDayKey(new Date(run.started_at));
      const row = byKey.get(key);
      if (!row) continue;
      const details = Array.isArray((run as any).details) ? (run as any).details : [];
      const scoped = details.filter((d: any) => d && targetIdSet.has(d.target_id));
      if (scoped.length === 0) continue;
      row.recordedRuns += 1;
      row.runNewPosts += scoped.reduce((s: number, d: any) => s + (Number(d.posts_found) || 0), 0);
      row.failed += scoped.filter((d: any) => d.status === 'failed').length;
      row.skipped += scoped.filter((d: any) => d.status === 'skipped_cooldown').length;
    }

    return rows.map((row) => ({
      ...row,
      profilesWithNew: [...row.profilesWithNew],
    }));
  }, [activeTargets, discovered, syncRuns]);


  // Build 7-day series for the activity chart
  const activitySeries = useMemo(() => {
    const days: { label: string; date: Date; likes: number; comments: number; posts: number; checked: number }[] = dailySyncRows.map((row) => ({
      label: shortWeekday(row.date),
      date: row.date,
      likes: 0,
      comments: 0,
      posts: row.newPosts,
      checked: row.checked,
    }));
    const base = new Date();
    base.setHours(0, 0, 0, 0);
    if (days.length === 0) return [];
    const startMs = days[0].date.getTime();
    for (const l of likes) {
      if (l.status !== 'liked') continue;
      const t = new Date(l.run_at).getTime();
      if (t < startMs) continue;
      const idx = Math.floor((t - startMs) / (24 * 3600 * 1000));
      if (days[idx]) days[idx].likes++;
    }
    for (const c of comments) {
      if (!c.posted_at) continue;
      const t = new Date(c.posted_at).getTime();
      if (t < startMs) continue;
      const idx = Math.floor((t - startMs) / (24 * 3600 * 1000));
      if (days[idx]) days[idx].comments++;
    }
    return days;
  }, [dailySyncRows, likes, comments]);
  const totalLikes7d = activitySeries.reduce((a, d) => a + d.likes, 0);
  const totalComments7d = activitySeries.reduce((a, d) => a + d.comments, 0);
  const totalPosts7d = activitySeries.reduce((a, d) => a + d.posts, 0);
  const totalChecks7d = activitySeries.reduce((a, d) => a + d.checked, 0);

  const yesterdayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    d.setDate(d.getDate() - 1);
    return d;
  }, []);
  const yesterdayEnd = useMemo(() => {
    const d = new Date(yesterdayStart);
    d.setDate(d.getDate() + 1);
    return d;
  }, [yesterdayStart]);
  const newPostsYesterday = useMemo(
    () => discovered.filter((p) => {
      const t = new Date(p.created_at).getTime();
      return t >= yesterdayStart.getTime() && t < yesterdayEnd.getTime();
    }).length,
    [discovered, yesterdayStart, yesterdayEnd],
  );

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
  const latestDailySync = useMemo(
    () => [...dailySyncRows].reverse().find((row) => row.checked > 0 || row.recordedRuns > 0) ?? null,
    [dailySyncRows],
  );
  const profilesChecked = latestDailySync?.checked ?? 0;
  const totalProfiles = activeTargets.length || targets.length;
  const latestSyncLabel = latestDailySync ? dailyStatusLabel(latestDailySync.date) : 'not synced yet';
  const nextSync = getNextScheduledSync();
  const minsUntil = Math.max(0, Math.floor((nextSync.getTime() - Date.now()) / 60_000));
  const nextLabel = minsUntil > 60 ? `${Math.floor(minsUntil / 60)}h ${minsUntil % 60}m` : `${minsUntil}m`;

  // For the "All discovered" tab, show every fetched contact — even ones with
  // no posts in the current 7-day window. Other tabs stay post-driven.
  const allRows: ReviewRow[] = useMemo(() => {
    const byId = new Map(rows.map((r) => [r.id, r]));
    const merged: ReviewRow[] = activeTargets.map((t: any) => {
      const existing = byId.get(t.id);
      if (existing) return existing;
      return {
        id: t.id,
        name: t.name || 'Unknown',
        avatar_url: t.avatar_url ?? null,
        title: t.title ?? null,
        company: t.company_name ?? null,
        linkedin_url: t.linkedin_url ?? null,
        new_posts: 0,
        last_post_at: t.last_seen_at || t.last_fetched_at || null,
        priority: 'low',
        posts: [],
      };
    });
    for (const r of rows) if (!activeTargets.some((t: any) => t.id === r.id)) merged.push(r);
    return merged;
  }, [rows, activeTargets]);

  const filteredRows = useMemo(() => {
    let out = queueTab === 'all' ? allRows : rows;
    const q = query.trim().toLowerCase();
    if (q) out = out.filter((r) => r.name.toLowerCase().includes(q) || (r.company || '').toLowerCase().includes(q));
    if (queueTab === 'engaged') out = out.filter((r) => r.posts.some((p) => p.is_liked || p.is_commented));
    if (queueTab === 'review') out = out.filter((r) => r.posts.some((p) => !p.is_liked && !p.is_commented));
    if (queueTab === 'dismissed') out = [];
    if (sort === 'new_posts') out = [...out].sort((a, b) => b.new_posts - a.new_posts);
    else if (sort === 'recent') out = [...out].sort((a, b) => (b.last_post_at || '').localeCompare(a.last_post_at || ''));
    else out = [...out].sort((a, b) => {
      const pr = { high: 3, medium: 2, low: 1 };
      return pr[b.priority] - pr[a.priority] || b.new_posts - a.new_posts;
    });
    return out;
  }, [rows, allRows, query, queueTab, sort]);

  const hasCompletedEngagement = totalLikes7d + totalComments7d > 0;
  const hasChartActivity = totalLikes7d + totalComments7d + totalPosts7d + totalChecks7d > 0;

  return (
    <div className="space-y-6">
      {/* System status bar */}
      <div className="rounded-[14px] border border-[#E5E7ED] bg-white px-4 py-3 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
        <StatusChip icon={<CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
          label={<><b className="text-[#171923] font-semibold">{profilesChecked}</b> of <b className="text-[#171923] font-semibold">{totalProfiles}</b> profiles checked <span className="text-[#667085]">{latestSyncLabel}</span></>} />
        <div className="h-4 w-px bg-[#E5E7ED]" />
        <StatusChip icon={<Sparkles className="h-3.5 w-3.5 text-[#7C3AED]" />}
          label={<><b className="text-[#171923] font-semibold">{totalPosts}</b> total posts · <b className="text-[#171923] font-semibold">{newPostsYesterday}</b> new yesterday</>} />
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
      {totalPosts > 0 && (
        <div className="rounded-[14px] border border-[#E5E7ED] bg-gradient-to-br from-white to-[#FBFAFF] p-5">
          <div className="flex items-start gap-4">
            <div className="h-10 w-10 rounded-lg bg-[#F4F0FF] text-[#7C3AED] flex items-center justify-center flex-shrink-0">
              <Sparkles className="h-5 w-5" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-[#171923] leading-relaxed">
                <b>{totalPosts} total posts</b> across <b>{profilesWithNew} profiles</b> · <b>{newPostsYesterday}</b> new yesterday.
                {!hasCompletedEngagement && <> No engagement actions have been completed today.</>}
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
                  onClick={() => document.getElementById('daily-syncs')?.scrollIntoView({ behavior: 'smooth' })}
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
        <TotalPostsCard
          total={totalPosts}
          newYesterday={newPostsYesterday}
          profileCount={profilesWithNew}
          posts={discovered}
          yesterdayStart={yesterdayStart}
          yesterdayEnd={yesterdayEnd}
        />
        <LikesCompletedCard likes={likes} />
        <KpiCard label="Comments completed" value={commentedToday} sub="today" icon={<MessageCircle className="h-4 w-4" />} />
        <KpiCard
          label="Failures"
          value={failedToday}
          sub={failedToday === 0 ? 'no issues detected' : 'need attention'}
          icon={<AlertTriangle className="h-4 w-4" />}
          warn={failedToday > 0}
        />
      </div>

      <DailySyncTimeline rows={dailySyncRows} latestRunStartedAt={syncRuns[0]?.started_at ?? null} />

      {/* Activity chart / empty state */}
      <section className="rounded-[14px] border border-[#E5E7ED] bg-white overflow-hidden" aria-label="Engagement activity">
        <div className="px-5 py-3 border-b border-[#E5E7ED] flex items-center justify-between gap-3 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[#171923]">Engagement activity</h2>
            <p className="text-xs text-[#667085] mt-0.5">Last 7 days</p>
          </div>
          <div className="flex items-center gap-4 text-xs">
            <div className="inline-flex items-center gap-1.5 text-[#3F4657]">
              <span className="h-2 w-2 rounded-full bg-[#10B981]" />
              <span>New posts</span>
              <span className="tabular-nums font-semibold text-[#171923]">{totalPosts7d}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[#3F4657]">
              <span className="h-2 w-2 rounded-full bg-[#7C3AED]" />
              <span>Likes</span>
              <span className="tabular-nums font-semibold text-[#171923]">{totalLikes7d}</span>
            </div>
            <div className="inline-flex items-center gap-1.5 text-[#3F4657]">
              <span className="h-2 w-2 rounded-full bg-[#06B6D4]" />
              <span>Comments</span>
              <span className="tabular-nums font-semibold text-[#171923]">{totalComments7d}</span>
            </div>
            <div className="hidden sm:inline-flex items-center gap-1.5 text-[#667085]">
              <span>Checks</span>
              <span className="tabular-nums font-semibold text-[#171923]">{totalChecks7d}</span>
            </div>
          </div>
        </div>
        {hasChartActivity ? (
          <ActivitySpark series={activitySeries} />
        ) : (
          <div className="p-8 flex flex-col items-center text-center">
            <div className="h-12 w-12 rounded-xl bg-[#F4F0FF] text-[#7C3AED] flex items-center justify-center mb-3">
              <BarChart3 className="h-6 w-6" />
            </div>
            <h3 className="text-sm font-semibold text-[#171923]">No engagement activity yet</h3>
            <p className="text-sm text-[#667085] mt-1 max-w-md">
              Nothing has been liked or commented on during this period. <b className="text-[#171923]">{totalPosts}</b> posts are ready to review (<b className="text-[#171923]">{newPostsYesterday}</b> new yesterday).
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

function DailySyncTimeline({ rows, latestRunStartedAt }: { rows: DailySyncRow[]; latestRunStartedAt: string | null }) {
  const mostRecent = [...rows].reverse().find((row) => row.checked > 0 || row.newPosts > 0 || row.recordedRuns > 0);
  return (
    <section id="daily-syncs" className="rounded-[14px] border border-[#E5E7ED] bg-white overflow-hidden" aria-label="Daily syncs">
      <div className="px-5 py-3 border-b border-[#E5E7ED] flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h2 className="text-sm font-semibold text-[#171923]">Daily syncs</h2>
          <p className="text-xs text-[#667085] mt-0.5">
            {mostRecent
              ? `${mostRecent.checked} profile${mostRecent.checked === 1 ? '' : 's'} checked ${dailyStatusLabel(mostRecent.date)} · ${mostRecent.newPosts} new post${mostRecent.newPosts === 1 ? '' : 's'}`
              : 'No profile checks in the last 7 days'}
          </p>
        </div>
        {latestRunStartedAt && (
          <span className="inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full bg-[#F7F8FB] text-[11px] text-[#667085] border border-[#E5E7ED]">
            <RefreshCw className="h-3 w-3" /> Stored run {relativeTime(latestRunStartedAt)}
          </span>
        )}
      </div>
      <div className="divide-y divide-[#E5E7ED]">
        {[...rows].reverse().map((row) => {
          const percent = row.total > 0 ? Math.min(100, (row.checked / row.total) * 100) : 0;
          const statusText = row.checked > 0
            ? `${row.checked} of ${row.total} checked`
            : row.recordedRuns > 0
              ? 'Run recorded'
              : 'No checks';
          return (
            <div key={row.key} className="px-5 py-3 grid grid-cols-[120px_minmax(0,1fr)_120px] gap-4 items-center">
              <div className="min-w-0">
                <div className="text-sm font-medium text-[#171923]">{row.label}</div>
                <div className="text-[11px] text-[#667085] tabular-nums">{row.date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</div>
              </div>
              <div className="min-w-0 space-y-2">
                <div className="flex items-center gap-3 text-xs text-[#3F4657] flex-wrap">
                  <span className="tabular-nums"><b className="text-[#171923]">{row.newPosts}</b> new post{row.newPosts === 1 ? '' : 's'}</span>
                  <span className="tabular-nums text-[#667085]">{statusText}</span>
                  {row.failed > 0 && <span className="text-[#B42318] tabular-nums">{row.failed} failed</span>}
                  {row.skipped > 0 && <span className="text-[#667085] tabular-nums">{row.skipped} skipped</span>}
                </div>
                <div className="h-1.5 rounded-full bg-[#EEF0F5] overflow-hidden">
                  <div className="h-full rounded-full bg-[#7C3AED] transition-all" style={{ width: `${percent}%` }} />
                </div>
                {row.profilesWithNew.length > 0 && (
                  <div className="text-[11px] text-[#667085] truncate">
                    {row.profilesWithNew.slice(0, 4).join(' · ')}{row.profilesWithNew.length > 4 ? ` +${row.profilesWithNew.length - 4} more` : ''}
                  </div>
                )}
              </div>
              <div className="text-right">
                <span className={cn(
                  'inline-flex items-center h-6 px-2 rounded-full border text-[11px] font-medium',
                  row.checked > 0
                    ? 'bg-[#ECFDF3] text-[#027A48] border-[#ABEFC6]'
                    : 'bg-[#F7F8FB] text-[#667085] border-[#E5E7ED]',
                )}>
                  {row.checked > 0 ? 'Synced' : 'Quiet'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function LikesCompletedCard({ likes }: { likes: import('@/hooks/useEngagementActivity').AutoLikeRun[] }) {
  const todayStart = useMemo(() => {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d.getTime();
  }, []);
  const likedToday = useMemo(
    () => likes
      .filter((l) => l.status === 'liked' && new Date(l.run_at).getTime() >= todayStart)
      .sort((a, b) => new Date(b.run_at).getTime() - new Date(a.run_at).getTime()),
    [likes, todayStart],
  );
  const value = likedToday.length;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-left rounded-[14px] border border-[#E5E7ED] bg-white p-4 transition-colors hover:bg-[#F7F8FB] hover:border-[#E4DAFB] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
          aria-label={`View ${value} likes completed today`}
        >
          <div className="flex items-center justify-between">
            <div className="h-7 w-7 rounded-md flex items-center justify-center bg-[#F7F8FB] text-[#667085]">
              <Heart className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium text-[#7C3AED] uppercase tracking-wider">View</span>
          </div>
          <div className="mt-2.5 text-[26px] leading-none font-semibold tracking-tight text-[#171923] tabular-nums">
            {value}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-[#171923]">Likes completed</span>
            <span className="text-[11px] text-[#667085]">today</span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[380px] p-0">
        <div className="px-4 py-3 border-b border-[#E5E7ED]">
          <div className="text-sm font-semibold text-[#171923]">Likes completed today</div>
          <div className="text-xs text-[#667085] mt-0.5">
            {likedToday.length === 0 ? 'No likes yet today.' : `${likedToday.length} post${likedToday.length === 1 ? '' : 's'} liked · most recent first`}
          </div>
        </div>
        <div className="max-h-[360px] overflow-y-auto">
          {likedToday.length === 0 ? (
            <div className="p-6 text-center">
              <Heart className="h-6 w-6 text-[#E5E7ED] mx-auto mb-2" />
              <p className="text-xs text-[#667085]">Auto-likes will appear here as they happen.</p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E5E7ED]">
              {likedToday.map((l) => (
                <li key={l.id} className="px-4 py-3 hover:bg-[#F7F8FB]">
                  <div className="flex items-start gap-2">
                    <Heart className="h-3.5 w-3.5 text-rose-500 fill-rose-500 mt-0.5 flex-shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#171923] truncate">
                          {l.target_name || 'Unknown profile'}
                        </span>
                        <span className="text-[11px] text-[#667085] tabular-nums flex-shrink-0">
                          {relativeTime(l.run_at)}
                        </span>
                      </div>
                      {l.post_excerpt && (
                        <p className="text-xs text-[#667085] mt-0.5 line-clamp-2 leading-snug">
                          {l.post_excerpt}
                        </p>
                      )}
                      {l.post_url && (
                        <a
                          href={l.post_url}
                          target="_blank"
                          rel="noreferrer"
                          className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#7C3AED] hover:underline"
                        >
                          Open post <ExternalLink className="h-2.5 w-2.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function TotalPostsCard({
  total, newYesterday, profileCount, posts, yesterdayStart, yesterdayEnd,
}: {
  total: number;
  newYesterday: number;
  profileCount: number;
  posts: DiscoveredPost[];
  yesterdayStart: Date;
  yesterdayEnd: Date;
}) {
  const [scope, setScope] = useState<'yesterday' | 'all'>('yesterday');
  const yesterdayPosts = useMemo(
    () => posts
      .filter((p) => {
        const t = new Date(p.created_at).getTime();
        return t >= yesterdayStart.getTime() && t < yesterdayEnd.getTime();
      })
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [posts, yesterdayStart, yesterdayEnd],
  );
  const allPosts = useMemo(
    () => [...posts].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()),
    [posts],
  );
  const list = scope === 'yesterday' ? yesterdayPosts : allPosts;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="text-left rounded-[14px] border border-[#E4DAFB] bg-[#FBFAFF] p-4 transition-colors hover:bg-[#F4F0FF] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#7C3AED]/40"
          aria-label={`View ${total} total posts, ${newYesterday} new yesterday`}
        >
          <div className="flex items-center justify-between">
            <div className="h-7 w-7 rounded-md flex items-center justify-center bg-[#F4F0FF] text-[#7C3AED]">
              <TrendingUp className="h-4 w-4" />
            </div>
            <span className="text-[10px] font-medium text-[#7C3AED] uppercase tracking-wider">View</span>
          </div>
          <div className="mt-2.5 text-[26px] leading-none font-semibold tracking-tight text-[#171923] tabular-nums">
            {total}
          </div>
          <div className="mt-1 flex items-baseline justify-between gap-2">
            <span className="text-xs font-medium text-[#171923]">Total posts</span>
            <span className="text-[11px] text-[#667085]">
              {newYesterday} new yesterday · {profileCount} profile{profileCount === 1 ? '' : 's'}
            </span>
          </div>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-0">
        <div className="px-4 py-3 border-b border-[#E5E7ED]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <div className="text-sm font-semibold text-[#171923]">Discovered posts</div>
              <div className="text-xs text-[#667085] mt-0.5">
                {list.length === 0 ? 'Nothing to show here.' : `${list.length} post${list.length === 1 ? '' : 's'} · most recent first`}
              </div>
            </div>
            <div className="inline-flex rounded-md border border-[#E5E7ED] p-0.5 text-[11px]">
              <button
                onClick={() => setScope('yesterday')}
                className={cn(
                  'px-2 h-6 rounded-sm font-medium transition-colors',
                  scope === 'yesterday' ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'text-[#667085] hover:text-[#171923]',
                )}
              >
                Yesterday
              </button>
              <button
                onClick={() => setScope('all')}
                className={cn(
                  'px-2 h-6 rounded-sm font-medium transition-colors',
                  scope === 'all' ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'text-[#667085] hover:text-[#171923]',
                )}
              >
                All
              </button>
            </div>
          </div>
        </div>
        <div className="max-h-[380px] overflow-y-auto">
          {list.length === 0 ? (
            <div className="p-6 text-center">
              <Sparkles className="h-6 w-6 text-[#E5E7ED] mx-auto mb-2" />
              <p className="text-xs text-[#667085]">
                {scope === 'yesterday' ? 'No new posts from yesterday.' : 'No discovered posts yet.'}
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-[#E5E7ED]">
              {list.map((p) => (
                <li key={p.id} className="px-4 py-3 hover:bg-[#F7F8FB]">
                  <div className="flex items-start gap-2.5">
                    <Avatar url={p.target_avatar_url} name={p.target_name || '?'} size={28} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-[#171923] truncate">
                          {p.target_name || 'Unknown profile'}
                        </span>
                        <span className="text-[11px] text-[#667085] tabular-nums flex-shrink-0">
                          {relativeTime(p.created_at)}
                        </span>
                      </div>
                      {p.content && (
                        <p className="text-xs text-[#667085] mt-0.5 line-clamp-2 leading-snug">
                          {p.content}
                        </p>
                      )}
                      <div className="mt-1 flex items-center gap-2 text-[11px] text-[#667085]">
                        <span className="tabular-nums">{p.likes_count} likes</span>
                        <span>·</span>
                        <span className="tabular-nums">{p.comments_count} comments</span>
                        {p.is_liked && (
                          <span className="inline-flex items-center gap-1 text-rose-600">
                            · <Heart className="h-2.5 w-2.5 fill-rose-500" /> Liked
                          </span>
                        )}
                        {p.linkedin_post_url && (
                          <a
                            href={p.linkedin_post_url}
                            target="_blank"
                            rel="noreferrer"
                            className="ml-auto inline-flex items-center gap-1 text-[#7C3AED] hover:underline"
                          >
                            Open <ExternalLink className="h-2.5 w-2.5" />
                          </a>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}





function ActivitySpark({ series }: { series: { label: string; date: Date; likes: number; comments: number; posts: number; checked: number }[] }) {
  const max = Math.max(1, ...series.map((d) => d.likes + d.comments + d.posts));
  const dateFmt = new Intl.DateTimeFormat(undefined, { month: 'short', day: 'numeric' });
  return (
    <div className="px-5 py-6">
      <div className="flex items-end gap-3 h-40">
        {series.map((d, i) => {
          const fullTotal = d.likes + d.comments + d.posts;
          const postH = (d.posts / max) * 100;
          const likeH = (d.likes / max) * 100;
          const commentH = (d.comments / max) * 100;
          return (
            <div key={i} className="flex-1 flex flex-col items-center gap-1.5 group">
              <div className="w-full flex-1 flex flex-col justify-end relative">
                <div
                  className="w-full opacity-0 group-hover:opacity-100 transition-opacity absolute -top-1 left-1/2 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-md bg-[#171923] text-white text-[10px] px-2 py-1 pointer-events-none z-10"
                >
                  {dateFmt.format(d.date)} · {d.posts} new · {d.likes} like{d.likes === 1 ? '' : 's'} · {d.comments} comment{d.comments === 1 ? '' : 's'} · {d.checked} checked
                </div>
                {fullTotal === 0 ? (
                  <div
                    className={cn('w-full rounded-md', d.checked > 0 ? 'bg-[#D0D5DD]' : 'bg-[#F4F0FF]')}
                    style={{ height: d.checked > 0 ? 24 : 4 }}
                  />
                ) : (
                  <div className="w-full flex flex-col overflow-hidden rounded-md" style={{ height: `${postH + likeH + commentH}%`, minHeight: 6 }}>
                    {d.comments > 0 && (
                      <div className="w-full bg-[#06B6D4]" style={{ flex: d.comments }} />
                    )}
                    {d.likes > 0 && (
                      <div className="w-full bg-gradient-to-t from-[#7C3AED] to-[#A78BFA]" style={{ flex: d.likes }} />
                    )}
                    {d.posts > 0 && (
                      <div className="w-full bg-[#10B981]" style={{ flex: d.posts }} />
                    )}
                  </div>
                )}
              </div>
              <span className="text-[10px] font-mono text-[#667085]">{d.label}</span>
            </div>
          );
        })}
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
              <span className="tabular-nums" title={p.published_at ? new Date(p.published_at).toLocaleString() : undefined}>
                {p.published_at ? relativeTime(p.published_at) : '—'}
              </span>
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

function startOfLocalDay(date: Date) {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

function localDayKey(date: Date) {
  const d = startOfLocalDay(date);
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${month}-${day}`;
}

function shortWeekday(date: Date) {
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function dailyLabel(date: Date) {
  const key = localDayKey(date);
  const today = localDayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === today) return 'Today';
  if (key === localDayKey(yesterday)) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'short' });
}

function dailyStatusLabel(date: Date) {
  const key = localDayKey(date);
  const today = localDayKey(new Date());
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  if (key === today) return 'today';
  if (key === localDayKey(yesterday)) return 'yesterday';
  return `on ${date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
}

/* ============================================================================
 * Add Profile Dialog — single + bulk
 * ==========================================================================*/
function AddProfileDialog({
  open, onOpenChange, publisher,
}: {
  open: boolean;
  onOpenChange: (o: boolean) => void;
  publisher: Publisher;
}) {
  const { createTarget, bulkCreateTargets } = useEngagementTargets(publisher.id);
  const [mode, setMode] = useState<'single' | 'bulk'>('single');
  const [url, setUrl] = useState('');
  const [name, setName] = useState('');
  const [bulk, setBulk] = useState('');
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState({ done: 0, total: 0 });

  const reset = () => {
    setUrl(''); setName(''); setBulk('');
    setProgress({ done: 0, total: 0 });
  };

  const handleSingle = () => {
    if (!url.trim().match(/linkedin\.com\/in\//)) {
      toast.error('Please paste a full LinkedIn profile URL (linkedin.com/in/…)');
      return;
    }
    createTarget.mutate(
      { publisher_id: publisher.id, linkedin_url: url.trim(), name: name.trim() || undefined },
      {
        onSuccess: () => {
          toast.success('Profile added — enriching in background');
          reset();
          onOpenChange(false);
        },
      }
    );
  };

  const handleBulk = async () => {
    const urls = bulk
      .split(/\r?\n|,/)
      .map((u) => u.trim())
      .filter((u) => u.match(/linkedin\.com\/in\//));
    if (urls.length === 0) {
      toast.error('Paste one LinkedIn profile URL per line.');
      return;
    }
    setImporting(true);
    setProgress({ done: 0, total: urls.length });

    let insertedIds: string[] = [];
    try {
      const res = await bulkCreateTargets.mutateAsync({
        publisher_id: publisher.id,
        urls,
      });
      insertedIds = res.ids;
    } catch (err) {
      console.error('Bulk add failed', err);
      setImporting(false);
      return;
    }
    setProgress({ done: urls.length, total: urls.length });
    setImporting(false);
    toast.success(`Added ${insertedIds.length} of ${urls.length} profiles — enriching in background`);

    // Server-side batched enrichment. The old path invoked enrich + fetch-posts
    // once per target from the browser, so closing the tab killed it partway.
    if (insertedIds.length > 0) {
      supabase.functions
        .invoke('bulk-enrich-targets', {
          body: { workspace_id: publisher.workspace_id, target_ids: insertedIds },
        })
        .catch((err) => console.error('bulk-enrich-targets invoke failed', err));
    }

    reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { onOpenChange(o); if (!o) reset(); }}>
      <DialogContent className="sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Add profiles for {publisher.name}</DialogTitle>
          <DialogDescription>
            Add one or many LinkedIn profiles. Name, title, company, and photo are fetched automatically.
          </DialogDescription>
        </DialogHeader>

        <Tabs value={mode} onValueChange={(v) => setMode(v as 'single' | 'bulk')} className="mt-2">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="single">Single</TabsTrigger>
            <TabsTrigger value="bulk">Bulk import</TabsTrigger>
          </TabsList>

          <TabsContent value="single" className="space-y-3 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="li-url" className="text-xs">LinkedIn URL</Label>
              <Input
                id="li-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://www.linkedin.com/in/username"
                onKeyDown={(e) => e.key === 'Enter' && handleSingle()}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="li-name" className="text-xs">Display name (optional)</Label>
              <Input
                id="li-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Auto-filled if left blank"
              />
            </div>
            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                className="h-9 px-3.5 rounded-lg text-sm text-[#667085] hover:text-[#171923]"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleSingle}
                disabled={createTarget.isPending || !url.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-medium disabled:opacity-50"
              >
                {createTarget.isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Add & fetch
              </button>
            </DialogFooter>
          </TabsContent>

          <TabsContent value="bulk" className="space-y-3 pt-4">
            <div className="space-y-1.5">
              <Label htmlFor="li-bulk" className="text-xs">LinkedIn URLs (one per line)</Label>
              <Textarea
                id="li-bulk"
                value={bulk}
                onChange={(e) => setBulk(e.target.value)}
                placeholder={'https://www.linkedin.com/in/alice\nhttps://www.linkedin.com/in/bob'}
                rows={8}
                className="font-mono text-xs"
              />
              <p className="text-xs text-[#667085]">
                Enrichment runs in the background after import.
              </p>
            </div>
            {importing && (
              <div className="text-xs text-[#667085]">
                Importing {progress.done} of {progress.total}…
              </div>
            )}
            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => onOpenChange(false)}
                disabled={importing}
                className="h-9 px-3.5 rounded-lg text-sm text-[#667085] hover:text-[#171923] disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleBulk}
                disabled={importing || !bulk.trim()}
                className="inline-flex items-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#7C3AED] hover:bg-[#6D28D9] text-white text-sm font-medium disabled:opacity-50"
              >
                {importing && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Import profiles
              </button>
            </DialogFooter>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}

