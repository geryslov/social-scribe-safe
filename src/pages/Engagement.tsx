import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Header } from '@/components/Header';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { useWorkspacePermissions } from '@/hooks/useWorkspacePermissions';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { Navigate } from 'react-router-dom';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { ContactList } from '@/components/engagement/ContactList';
import { PostPanel } from '@/components/engagement/PostPanel';
import { EngagementActivity } from '@/components/engagement/EngagementActivity';
import { EngagementTarget, useEngagementTargets } from '@/hooks/useEngagement';
import { useEngagementSync, getNextScheduledSync } from '@/hooks/useEngagementSync';
import { useEngagementSyncRuns } from '@/hooks/useEngagementActivity';
import {
  RefreshCw, Loader2, ChevronDown, Check, Clock, Heart, Wand2,
  Radio, BarChart3,
} from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

// Folder scope sentinel: 'all' = no filter, 'unfiled' = folder_id IS NULL,
// any other string is a folder UUID.
export type FolderScope = 'all' | 'unfiled' | string;

export default function Engagement() {
  const { user, isAdmin } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { can } = useWorkspacePermissions();
  const canManage = isAdmin || can.manageWorkspace || can.assign;
  const { publishers, isLoading: pubsLoading } = usePublishers();
  const [selectedPublisherId, setSelectedPublisherId] = useState<string | null>(null);
  const [selectedTarget, setSelectedTarget] = useState<EngagementTarget | null>(null);
  const [folderScope, setFolderScope] = useState<FolderScope>('all');
  const [tab, setTab] = useState<'feed' | 'activity'>('activity');
  const { targets, markSeen } = useEngagementTargets(selectedPublisherId);

  const handleSelectTarget = (target: EngagementTarget) => {
    setSelectedTarget(target);
    markSeen.mutate(target.id);
  };

  if (!user) return <Navigate to="/auth" replace />;

  if (!selectedPublisherId && publishers.length > 0) {
    setSelectedPublisherId(publishers[0].id);
  }

  const selectedPublisher = publishers.find((p) => p.id === selectedPublisherId) || null;
  // Keep selectedTarget in sync with the live query (so toggles like auto_like are reflected immediately).
  const liveSelectedTarget = selectedTarget
    ? (targets.find((t) => t.id === selectedTarget.id) ?? selectedTarget)
    : null;


  return (
    <div className="min-h-screen bg-background">
      <Header />
      <main id="main-content" className="h-[calc(100vh-3.5rem)] flex flex-col">
        {/* ── Command bar ─────────────────────────────────────────────── */}
        <CommandBar
          selectedPublisher={selectedPublisher}
          publishers={publishers}
          folderScope={folderScope}
          canManage={canManage}
          tab={tab}
          onChangeTab={setTab}
          onSelectPublisher={(id) => {
            setSelectedPublisherId(id);
            setSelectedTarget(null);
            setFolderScope('all');
          }}
        />

        {/* ── Body ────────────────────────────────────────────────────── */}
        {!selectedPublisher ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            {pubsLoading ? 'Loading publishers…' : 'No publishers in this workspace.'}
          </div>
        ) : tab === 'activity' ? (
          <EngagementActivity publisher={selectedPublisher} />
        ) : (
          <div className="flex-1 flex overflow-hidden">
            <div className="w-[320px] flex-shrink-0 border-r flex flex-col bg-muted/10">
              <ContactList
                publisher={selectedPublisher}
                isAdmin={canManage}
                selectedTargetId={selectedTarget?.id || null}
                onSelectTarget={handleSelectTarget}
                folderScope={folderScope}
                onChangeFolderScope={setFolderScope}
              />
            </div>
            <div className="flex-1 flex flex-col overflow-hidden">
              <PostPanel
                target={liveSelectedTarget}
                publisher={selectedPublisher}
                isAdmin={canManage}
                onCleared={() => setSelectedTarget(null)}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// =============================================================================
// CommandBar — eyebrow + publisher switcher + day counter + sync controls
// =============================================================================

interface CommandBarProps {
  selectedPublisher: Publisher | null;
  publishers: Publisher[];
  folderScope: FolderScope;
  canManage: boolean;
  tab: 'feed' | 'activity';
  onChangeTab: (t: 'feed' | 'activity') => void;
  onSelectPublisher: (id: string) => void;
}

function CommandBar({ selectedPublisher, publishers, folderScope, canManage, tab, onChangeTab, onSelectPublisher }: CommandBarProps) {
  const { runNow, lastRun, settings } = useEngagementSync();
  const { data: recentRuns = [] } = useEngagementSyncRuns(10);
  const isSyncing = runNow.isPending;
  const autoEnabled = settings?.auto_sync_enabled ?? true;
  const nextSync = getNextScheduledSync();
  const minsUntilNext = Math.max(0, Math.floor((nextSync.getTime() - Date.now()) / 60_000));
  const nextLabel = autoEnabled
    ? minsUntilNext > 60
      ? `${Math.floor(minsUntilNext / 60)}h ${minsUntilNext % 60}m`
      : `${minsUntilNext}m`
    : 'off';

  return (
    <div className="relative bg-background border-b">
      <div className="h-12 px-5 flex items-center gap-4">
        {/* Eyebrow */}
        <span className="text-[10.5px] font-mono uppercase tracking-[0.18em] text-muted-foreground/80 hidden sm:inline">
          Engagement
        </span>
        <span className="text-border hidden sm:inline">·</span>

        {/* Publisher switcher */}
        <PublisherSwitcher
          selected={selectedPublisher}
          publishers={publishers}
          onSelect={onSelectPublisher}
        />

        {/* Day counter */}
        {selectedPublisher && (
          <>
            <span className="text-border hidden md:inline">·</span>
            <DayCounter publisherId={selectedPublisher.id} folderScope={folderScope} />
          </>
        )}

        <div className="flex-1" />

        {/* Feed / Activity tab switcher */}
        <div className="inline-flex items-center rounded-md border bg-muted/40 p-0.5">
          <button
            onClick={() => onChangeTab('feed')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors',
              tab === 'feed' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <Radio className="h-3 w-3" /> Feed
          </button>
          <button
            onClick={() => onChangeTab('activity')}
            className={cn(
              'inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium rounded-sm transition-colors',
              tab === 'activity' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            <BarChart3 className="h-3 w-3" /> Activity
          </button>
        </div>

        {/* Last pull — clickable popover with recent-runs detail */}
        {lastRun && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="hidden lg:inline text-[10.5px] font-mono text-muted-foreground/70 hover:text-foreground tabular-nums px-2 py-1 rounded hover:bg-muted/60 transition-colors"
                title="Show recent sync runs"
              >
                <span className="text-emerald-700 font-semibold">+{lastRun.new_posts}</span> new
                <span className="mx-1.5 text-border">·</span>
                <span>{lastRun.synced}/{lastRun.total_targets} pulled</span>
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-96 p-0">
              <div className="px-3 py-2 border-b flex items-center justify-between">
                <span className="text-xs font-semibold">Recent syncs</span>
                <span className="text-[10px] font-mono text-muted-foreground/60">last {recentRuns.length}</span>
              </div>
              <div className="max-h-80 overflow-y-auto">
                {recentRuns.length === 0 ? (
                  <div className="p-4 text-xs text-muted-foreground text-center">No sync has run yet.</div>
                ) : (
                  recentRuns.map((r) => (
                    <div key={r.id} className="px-3 py-2 border-b last:border-0 text-xs">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-muted-foreground tabular-nums">
                          {new Date(r.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </span>
                        <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">{r.trigger}</span>
                      </div>
                      <div className="mt-1 flex items-baseline gap-2 tabular-nums">
                        <span className="text-emerald-700 font-semibold">+{r.new_posts} new</span>
                        <span className="text-muted-foreground">{r.synced}/{r.total_targets} synced</span>
                        {r.failed > 0 && <span className="text-red-600">{r.failed} failed</span>}
                        {r.skipped > 0 && <span className="text-muted-foreground/70">{r.skipped} skipped</span>}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </PopoverContent>
          </Popover>
        )}

        {/* Next pull */}
        <span className="inline-flex items-center gap-1 text-[10.5px] font-mono text-muted-foreground/60 tabular-nums">
          <Clock className="h-3 w-3" />
          next {nextLabel}
        </span>

        {/* Manual sync (per-publisher backfill) */}
        {canManage && selectedPublisher && (
          <Button
            size="sm"
            onClick={() => {
              window.dispatchEvent(
                new CustomEvent('engagement:sync-all', {
                  detail: { publisherId: selectedPublisher.id },
                }),
              );
              toast.info('Syncing profiles & posts…');
            }}
            disabled={isSyncing}
            className={cn(
              'h-8 gap-1.5 text-xs font-semibold px-3',
              'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/30',
            )}
            title="Re-enrich profiles and fetch posts for everyone in this list"
          >
            {isSyncing ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Wand2 className="h-3.5 w-3.5" />
            )}
            {isSyncing ? 'Syncing' : 'Manual sync'}
          </Button>
        )}
      </div>


      {/* 3px progress strip (only visible during sync) */}
      <div
        className={cn(
          'absolute left-0 right-0 -bottom-px h-[3px] overflow-hidden pointer-events-none',
          !isSyncing && 'opacity-0',
        )}
      >
        <div className="h-full bg-gradient-to-r from-amber-400 via-amber-500 to-amber-400 animate-pulse" />
      </div>
    </div>
  );
}

// -----------------------------------------------------------------------------
// PublisherSwitcher
// -----------------------------------------------------------------------------

interface PublisherSwitcherProps {
  selected: Publisher | null;
  publishers: Publisher[];
  onSelect: (id: string) => void;
}

function PublisherSwitcher({ selected, publishers, onSelect }: PublisherSwitcherProps) {
  const [open, setOpen] = useState(false);
  if (!selected) return null;
  const initials = selected.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 h-8 px-1.5 pr-2 rounded-md hover:bg-muted/60 transition-colors"
        >
          <div className="h-6 w-6 rounded-full overflow-hidden bg-muted text-[9px] font-bold text-foreground/60 flex items-center justify-center flex-shrink-0">
            {selected.avatar_url ? (
              <img
                src={selected.avatar_url}
                alt={selected.name}
                referrerPolicy="no-referrer"
                className="h-full w-full object-cover"
              />
            ) : (
              initials
            )}
          </div>
          <span className="text-sm font-display font-semibold leading-none">
            {selected.name}
          </span>
          <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-1">
        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60 px-2 py-1.5">
          Engager
        </div>
        {publishers.map((p) => {
          const isActive = p.id === selected.id;
          const pInitials = p.name
            .split(' ')
            .map((w) => w[0])
            .join('')
            .slice(0, 2)
            .toUpperCase();
          return (
            <button
              key={p.id}
              type="button"
              onClick={() => {
                onSelect(p.id);
                setOpen(false);
              }}
              className={cn(
                'w-full flex items-center gap-2.5 px-2 py-1.5 rounded text-left transition-colors',
                isActive ? 'bg-amber-50' : 'hover:bg-muted/60',
              )}
            >
              <div className="h-7 w-7 rounded-full overflow-hidden bg-muted text-[10px] font-bold text-foreground/60 flex items-center justify-center flex-shrink-0">
                {p.avatar_url ? (
                  <img
                    src={p.avatar_url}
                    alt={p.name}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                ) : (
                  pInitials
                )}
              </div>
              <span className="flex-1 text-sm font-medium truncate">{p.name}</span>
              {isActive && <Check className="h-3.5 w-3.5 text-amber-600" />}
            </button>
          );
        })}
      </PopoverContent>
    </Popover>
  );
}

// -----------------------------------------------------------------------------
// DayCounter — "4 of 12 today" with 12 progress dots
// -----------------------------------------------------------------------------

interface DayCounterProps {
  publisherId: string;
  folderScope: FolderScope;
}

function DayCounter({ publisherId, folderScope }: DayCounterProps) {
  const { currentWorkspace } = useWorkspace();

  const { data } = useQuery({
    queryKey: ['day-counter', currentWorkspace?.id, publisherId, folderScope],
    queryFn: async () => {
      if (!currentWorkspace) return { fresh: 0, done: 0, likedToday: 0 };
      // Fetch the publisher's targets, scoped by folder
      let q = (supabase as any)
        .from('engagement_targets')
        .select('id')
        .eq('workspace_id', currentWorkspace.id)
        .eq('publisher_id', publisherId);
      if (folderScope === 'unfiled') {
        q = q.is('folder_id', null);
      } else if (folderScope !== 'all') {
        q = q.eq('folder_id', folderScope);
      }
      const { data: targets, error: tErr } = await q;
      if (tErr || !targets || targets.length === 0) return { fresh: 0, done: 0, likedToday: 0 };
      const ids = targets.map((t: any) => t.id);
      const { data: rows } = await (supabase as any)
        .from('engagement_posts')
        .select('is_commented, is_liked, liked_at')
        .in('target_id', ids);
      const r = (rows || []) as Array<{ is_commented: boolean; is_liked: boolean; liked_at: string | null }>;
      const fresh = r.filter((p) => !p.is_commented && !p.is_liked).length;
      const done = r.filter((p) => p.is_commented || p.is_liked).length;
      const startOfDay = new Date();
      startOfDay.setHours(0, 0, 0, 0);
      const likedToday = r.filter(
        (p) => p.liked_at && new Date(p.liked_at).getTime() >= startOfDay.getTime(),
      ).length;
      return { fresh, done, likedToday };
    },
    enabled: !!currentWorkspace,
    refetchInterval: 30_000,
  });

  const fresh = data?.fresh ?? 0;
  const done = data?.done ?? 0;
  const likedToday = data?.likedToday ?? 0;
  const total = fresh + done;
  const dotCount = useMemo(() => Math.min(Math.max(total, 1), 12), [total]);

  if (total === 0) return null;

  // Distribute dots — first N filled jade for done, the rest empty
  const filled = Math.round((done / Math.max(total, 1)) * dotCount);

  return (
    <div className="hidden md:flex items-center gap-2.5">
      <span className="text-[11px] font-medium tabular-nums">
        <span className="text-emerald-700 font-semibold">{done}</span>
        <span className="text-muted-foreground/70 mx-0.5">of</span>
        <span className="text-foreground/80">{total}</span>
        <span className="text-muted-foreground/70 ml-1">today</span>
      </span>
      <div className="flex items-center gap-[3px]">
        {Array.from({ length: dotCount }).map((_, i) => (
          <span
            key={i}
            className={cn(
              'h-1.5 w-1.5 rounded-full transition-colors',
              i < filled ? 'bg-emerald-500' : 'bg-muted-foreground/15',
            )}
          />
        ))}
      </div>
      {likedToday > 0 && (
        <span
          className="inline-flex items-center gap-1 text-[11px] font-medium text-rose-600 tabular-nums"
          title={`${likedToday} post${likedToday === 1 ? '' : 's'} liked today (auto + manual). Open the Liked tab to see them.`}
        >
          <Heart className="h-3 w-3 fill-current" />
          {likedToday}
        </span>
      )}
    </div>
  );
}
