import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEngagementTargets, useFetchTargetPosts, EngagementTarget } from '@/hooks/useEngagement';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Search, Loader2, Linkedin, RefreshCw, Building2, Upload, CheckCircle2, Sparkles, Zap, CheckSquare, Trash2, ArrowRightLeft, X, Wand2, DownloadCloud } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';

interface ContactListProps {
  publisher: Publisher;
  isAdmin: boolean;
  selectedTargetId: string | null;
  onSelectTarget: (target: EngagementTarget) => void;
}

function timeAgoShort(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function ContactList({ publisher, isAdmin, selectedTargetId, onSelectTarget }: ContactListProps) {
  const { currentWorkspace } = useWorkspace();
  const { targets, isLoading, createTarget, enrichTarget, updateTarget, bulkDeleteTargets, bulkReassignTargets } = useEngagementTargets(publisher.id);
  const { publishers } = usePublishers();
  const fetchPosts = useFetchTargetPosts();

  // Multi-select state
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showReassignDialog, setShowReassignDialog] = useState(false);
  const [reassignPublisherId, setReassignPublisherId] = useState<string>('');
  const [confirmDelete, setConfirmDelete] = useState(false);

  const exitSelectionMode = () => {
    setSelectionMode(false);
    setSelectedIds(new Set());
    setConfirmDelete(false);
  };

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [fetchingAll, setFetchingAll] = useState(false);
  const [fetchingTargetId, setFetchingTargetId] = useState<string | null>(null);
  const prevAutoName = useRef<string>('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });
  const [onlyFresh, setOnlyFresh] = useState(false);

  // Unseen post counts + fresh/done engagement status counts per target
  const { data: countMaps = { unseen: {}, fresh: {}, done: {} } } = useQuery({
    queryKey: ['target-counts', currentWorkspace?.id, publisher.id, targets.map((t) => `${t.id}:${t.last_seen_at}:${t.last_fetched_at}`).join(',')],
    queryFn: async () => {
      if (!currentWorkspace || targets.length === 0) return { unseen: {}, fresh: {}, done: {} };
      const unseen: Record<string, number> = {};
      const fresh: Record<string, number> = {};
      const done: Record<string, number> = {};
      for (const target of targets) {
        // Unseen (newly synced since last visit)
        let unseenQ = (supabase as any)
          .from('engagement_posts')
          .select('id', { count: 'exact', head: true })
          .eq('target_id', target.id);
        if (target.last_seen_at) unseenQ = unseenQ.gt('created_at', target.last_seen_at);
        const { count: unseenCount } = await unseenQ;
        if (unseenCount && unseenCount > 0) unseen[target.id] = unseenCount;

        const { data: statusRows } = await (supabase as any)
          .from('engagement_posts')
          .select('id, is_commented, is_liked')
          .eq('target_id', target.id);

        const rows = (statusRows || []) as Array<{ is_commented: boolean; is_liked: boolean }>;
        const freshCount = rows.filter((p) => !p.is_commented && !p.is_liked).length;
        const doneCount = rows.filter((p) => p.is_commented || p.is_liked).length;
        if (freshCount > 0) fresh[target.id] = freshCount;
        if (doneCount > 0) done[target.id] = doneCount;
      }
      return { unseen, fresh, done };
    },
    enabled: !!currentWorkspace && targets.length > 0,
  });
  const unseenCounts = countMaps.unseen as Record<string, number>;
  const freshCounts = countMaps.fresh as Record<string, number>;
  const doneCounts = countMaps.done as Record<string, number>;
  const totalFresh = Object.values(freshCounts).reduce((s, n) => s + n, 0);
  const targetsWithFresh = Object.keys(freshCounts).length;
  const totalDone = Object.values(doneCounts).reduce((s, n) => s + n, 0);
  const targetsWithDone = Object.keys(doneCounts).length;

  const filtered = useMemo(() => {
    let list = targets;
    if (onlyFresh) list = list.filter((t) => (freshCounts[t.id] || 0) > 0);
    if (!search.trim()) {
      // sort by fresh count desc so net-new opportunities float up
      return [...list].sort((a, b) => (freshCounts[b.id] || 0) - (freshCounts[a.id] || 0));
    }
    const q = search.toLowerCase();
    return list.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.headline || '').toLowerCase().includes(q) ||
        (t.company_name || '').toLowerCase().includes(q) ||
        (t.title || '').toLowerCase().includes(q) ||
        (t.linkedin_username || '').toLowerCase().includes(q),
    );
  }, [targets, search, onlyFresh, freshCounts]);

  // Auto-fetch after adding a target
  const handleAdd = useCallback(() => {
    if (!newUrl.trim() || !currentWorkspace) return;
    // Use entered name, or extract from URL as fallback
    const name = newName.trim() || newUrl.match(/linkedin\.com\/in\/([^/?#]+)/)?.[1]?.replace(/-/g, ' ')?.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';
    createTarget.mutate(
      { publisher_id: publisher.id, name, linkedin_url: newUrl.trim() },
      {
        onSuccess: (data: any) => {
          setNewName('');
          setNewUrl('');
          setShowAddDialog(false);
          // Auto-fetch posts to pull profile data
          if (data?.id) {
            setFetchingTargetId(data.id);
            fetchPosts.mutate(
              { workspace_id: currentWorkspace.id, target_id: data.id },
              { onSettled: () => setFetchingTargetId(null) },
            );
          }
        },
      },
    );
  }, [newName, newUrl, currentWorkspace, publisher.id, createTarget, fetchPosts]);

  // Bulk import: parse URLs, add each, enrich in background
  const handleBulkImport = useCallback(async () => {
    if (!currentWorkspace || !bulkUrls.trim()) return;
    // Extract all LinkedIn URLs from the textarea
    const lines = bulkUrls.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    const urls = lines
      .map((line) => {
        // Accept full URLs or just usernames
        if (line.includes('linkedin.com/in/')) return line;
        // If just a username, build URL
        if (/^[a-zA-Z0-9-]+$/.test(line)) return `https://www.linkedin.com/in/${line}`;
        return null;
      })
      .filter(Boolean) as string[];

    if (urls.length === 0) {
      toast.error('No valid LinkedIn URLs found');
      return;
    }

    setBulkImporting(true);
    setBulkProgress({ done: 0, total: urls.length });

    // 1) Create all rows first (skip auto-enrichment to avoid Apify rate limits)
    const createdIds: string[] = [];
    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
      const name = match?.[1]?.replace(/-/g, ' ')?.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';
      try {
        const row = await createTarget.mutateAsync({
          publisher_id: publisher.id,
          name,
          linkedin_url: url,
          skipEnrich: true,
        });
        if (row?.id) createdIds.push(row.id);
      } catch {
        // skip duplicates / errors
      }
      setBulkProgress({ done: i + 1, total: urls.length });
    }

    setBulkImporting(false);
    setBulkUrls('');
    setShowAddDialog(false);
    toast.success(`Imported ${createdIds.length} profiles — enriching in background`);

    // 2) Enrich with limited concurrency (2 at a time) so Apify doesn't 429
    (async () => {
      const CONCURRENCY = 2;
      let cursor = 0;
      const workers = Array.from({ length: Math.min(CONCURRENCY, createdIds.length) }, async () => {
        while (cursor < createdIds.length) {
          const id = createdIds[cursor++];
          try {
            await supabase.functions.invoke('enrich-engagement-target', { body: { target_id: id } });
          } catch (err) {
            console.error('Bulk enrich failed for', id, err);
          }
        }
      });
      await Promise.all(workers);
      // Final refresh so any updated rows render
      // (the polling refetchInterval also picks up pending rows during the run)
      window.dispatchEvent(new Event('focus'));
    })();
  }, [bulkUrls, currentWorkspace, publisher.id, createTarget]);

  const handleFetchAll = async () => {
    if (!currentWorkspace || fetchingAll) return;
    setFetchingAll(true);
    for (const target of targets.filter((t) => t.is_active)) {
      try {
        await fetchPosts.mutateAsync({ workspace_id: currentWorkspace.id, target_id: target.id });
      } catch { /* continue */ }
    }
    setFetchingAll(false);
  };

  const [reEnriching, setReEnriching] = useState(false);
  const [reEnrichProgress, setReEnrichProgress] = useState({ done: 0, total: 0 });
  const handleReEnrichMissing = async () => {
    if (reEnriching) return;
    const missing = targets.filter((t) => t.enrichment_status !== 'succeeded');
    if (missing.length === 0) {
      toast.info('All profiles already enriched');
      return;
    }
    setReEnriching(true);
    setReEnrichProgress({ done: 0, total: missing.length });
    toast.info(`Re-enriching ${missing.length} profile${missing.length === 1 ? '' : 's'}…`);

    const CONCURRENCY = 2;
    let idx = 0;
    let done = 0;
    let failed = 0;
    const worker = async () => {
      while (idx < missing.length) {
        const i = idx++;
        const t = missing[i];
        try {
          await enrichTarget.mutateAsync(t.id);
        } catch {
          failed++;
        }
        done++;
        setReEnrichProgress({ done, total: missing.length });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    setReEnriching(false);
    if (failed > 0) {
      toast.warning(`Re-enriched ${done - failed}/${missing.length}. ${failed} failed.`);
    } else {
      toast.success(`Re-enriched ${done} profile${done === 1 ? '' : 's'}`);
    }
    window.dispatchEvent(new Event('focus'));
  };

  const [resyncing, setResyncing] = useState(false);
  const [resyncProgress, setResyncProgress] = useState({ done: 0, total: 0 });
  const handleResyncMissingPosts = async () => {
    if (resyncing || !currentWorkspace) return;
    const missing = targets.filter(
      (t) => t.is_active && !freshCounts[t.id] && !doneCounts[t.id],
    );
    if (missing.length === 0) {
      toast.info('All profiles already have posts');
      return;
    }
    setResyncing(true);
    setResyncProgress({ done: 0, total: missing.length });
    toast.info(`Fetching posts for ${missing.length} profile${missing.length === 1 ? '' : 's'}…`);

    const CONCURRENCY = 2;
    let idx = 0;
    let done = 0;
    let failed = 0;
    let totalFound = 0;
    const worker = async () => {
      while (idx < missing.length) {
        const i = idx++;
        const t = missing[i];
        try {
          const res = await fetchPosts.mutateAsync({ workspace_id: currentWorkspace.id, target_id: t.id });
          totalFound += res?.posts_found || 0;
        } catch {
          failed++;
        }
        done++;
        setResyncProgress({ done, total: missing.length });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));

    setResyncing(false);
    if (failed > 0) {
      toast.warning(`Synced ${done - failed}/${missing.length} · ${totalFound} posts · ${failed} failed`);
    } else {
      toast.success(`Synced ${done} profile${done === 1 ? '' : 's'} · ${totalFound} posts`);
    }
  };

  const activeTargets = targets.filter((t) => t.is_active);
  const allAutoLike = activeTargets.length > 0 && activeTargets.every((t) => t.auto_like);
  const [bulkAutoLiking, setBulkAutoLiking] = useState(false);
  const handleToggleAllAutoLike = async (checked: boolean) => {
    if (activeTargets.length === 0) return;
    setBulkAutoLiking(true);
    try {
      await Promise.all(
        activeTargets
          .filter((t) => t.auto_like !== checked)
          .map((t) => updateTarget.mutateAsync({ id: t.id, updates: { auto_like: checked } })),
      );
      toast.success(checked ? `Auto-like enabled for ${activeTargets.length} profiles` : `Auto-like disabled for ${activeTargets.length} profiles`);
    } finally {
      setBulkAutoLiking(false);
    }
  };

  return (
    <>
      {/* Header */}
      <div className="p-3 space-y-2 border-b">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Profiles ({targets.length})
          </span>
          <div className="flex gap-1 items-center">
            {isAdmin && targets.length > 0 && !selectionMode && (() => {
              const missingCount = targets.filter((t) => t.enrichment_status !== 'succeeded').length;
              const missingPosts = targets.filter(
                (t) => t.is_active && !freshCounts[t.id] && !doneCounts[t.id] && t.last_fetched_at,
              ).length;
              const totalErrored = missingCount + (missingPosts > missingCount ? missingPosts - missingCount : 0);
              if (totalErrored === 0 && !reEnriching && !resyncing) return null;
              const isRunning = reEnriching || resyncing;
              return (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-[11px] font-medium text-amber-600 hover:text-amber-700 hover:bg-amber-500/10"
                  onClick={async () => {
                    if (missingCount > 0) await handleReEnrichMissing();
                    if (missingPosts > 0) await handleResyncMissingPosts();
                  }}
                  disabled={isRunning}
                  title="Retry profiles that failed to sync"
                >
                  {isRunning ? (
                    <>
                      <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" />
                      {(reEnriching ? reEnrichProgress : resyncProgress).done}/{(reEnriching ? reEnrichProgress : resyncProgress).total}
                    </>
                  ) : (
                    <>
                      <Wand2 className="h-3.5 w-3.5 mr-1" />
                      Retry {totalErrored} failed
                    </>
                  )}
                </Button>
              );
            })()}
            {isAdmin && !selectionMode && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-primary hover:bg-primary/10"
                onClick={() => setShowAddDialog(true)}
                title="Add person"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>

        {/* Bulk action bar */}
        {selectionMode && (
          <div className="flex items-center gap-2 rounded-md bg-primary/5 border border-primary/30 px-2 py-1.5">
            <span className="text-[11px] font-semibold text-primary">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                if (selectedIds.size === filtered.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(filtered.map((t) => t.id)));
              }}
              className="text-[10px] text-primary hover:underline font-medium"
            >
              {selectedIds.size === filtered.length && filtered.length > 0 ? 'Clear' : 'All'}
            </button>
            <Button
              size="sm"
              variant="outline"
              className="h-6 text-[11px] gap-1 px-2"
              disabled={selectedIds.size === 0 || bulkReassignTargets.isPending}
              onClick={() => {
                setReassignPublisherId('');
                setShowReassignDialog(true);
              }}
            >
              <ArrowRightLeft className="h-3 w-3" />
              Move
            </Button>
            <Button
              size="sm"
              variant="outline"
              className={cn(
                'h-6 text-[11px] gap-1 px-2',
                confirmDelete
                  ? 'border-destructive text-destructive bg-destructive/10'
                  : 'text-destructive border-destructive/40',
              )}
              disabled={selectedIds.size === 0 || bulkDeleteTargets.isPending}
              onClick={() => {
                if (confirmDelete) {
                  bulkDeleteTargets.mutate(Array.from(selectedIds), {
                    onSuccess: () => exitSelectionMode(),
                  });
                } else {
                  setConfirmDelete(true);
                  setTimeout(() => setConfirmDelete(false), 3000);
                }
              }}
            >
              {bulkDeleteTargets.isPending ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Trash2 className="h-3 w-3" />
              )}
              {confirmDelete ? 'Confirm?' : 'Delete'}
            </Button>
            <button
              type="button"
              onClick={exitSelectionMode}
              className="text-muted-foreground hover:text-foreground p-1 rounded"
              title="Exit selection"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-8 pl-8 text-sm bg-background focus-visible:ring-primary/30"
          />
        </div>

        {/* Bulk auto-like toggle for all profiles */}
        {isAdmin && activeTargets.length > 0 && (
          <div
            className={cn(
              'flex items-center justify-between gap-2 rounded-md px-2.5 py-1.5 border transition-colors',
              allAutoLike
                ? 'bg-amber-50 border-amber-200/70'
                : 'bg-muted/40 border-border',
            )}
            title="Auto-like every new post from all profiles in this list"
          >
            <span className="flex items-center gap-1.5 min-w-0">
              <Zap className={cn('h-3.5 w-3.5 flex-shrink-0', allAutoLike ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground')} />
              <span className="text-[11px] font-semibold truncate">
                Auto-like all ({activeTargets.length})
              </span>
            </span>
            {bulkAutoLiking ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />
            ) : (
              <Switch
                checked={allAutoLike}
                onCheckedChange={handleToggleAllAutoLike}
                className="data-[state=checked]:bg-amber-500"
              />
            )}
          </div>
        )}


        {/* Engagement status summary */}
        <div className="grid grid-cols-2 gap-1.5">
          <button
            type="button"
            onClick={() => setOnlyFresh((v) => !v)}
            className={cn(
              'flex min-w-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-semibold transition-colors border',
              onlyFresh
                ? 'bg-primary text-primary-foreground border-primary shadow-sm'
                : 'bg-amber-50 text-amber-800 border-amber-200/70 hover:bg-amber-100/70',
            )}
            title="Show only profiles with posts you haven't engaged with"
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <Sparkles className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Fresh</span>
            </span>
            <span className="tabular-nums">{totalFresh}</span>
          </button>

          <div
            className="flex min-w-0 items-center justify-between gap-2 rounded-md px-2.5 py-1.5 text-[11px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200/70"
            title={`${targetsWithDone} profile${targetsWithDone === 1 ? '' : 's'} already have posts you engaged with`}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <CheckCircle2 className="h-3 w-3 flex-shrink-0" />
              <span className="truncate">Done</span>
            </span>
            <span className="tabular-nums">{totalDone}</span>
          </div>
        </div>

        {onlyFresh && (
          <div className="text-[10px] font-medium text-muted-foreground px-0.5">
            Showing {targetsWithFresh} profile{targetsWithFresh === 1 ? '' : 's'} with fresh posts
          </div>
        )}
      </div>

      {/* Contact rows */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center">
            {targets.length === 0 ? (
              <>
                <Linkedin className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">No profiles yet</p>
                {isAdmin && (
                  <Button
                    variant="link"
                    size="sm"
                    className="text-xs text-primary mt-1 h-auto p-0"
                    onClick={() => setShowAddDialog(true)}
                  >
                    Add your first profile
                  </Button>
                )}
              </>
            ) : (
              <p className="text-xs text-muted-foreground">No results for "{search}"</p>
            )}
          </div>
        ) : (
          <div>
            {filtered.map((target) => {
              const isSelected = selectedTargetId === target.id;
              const isFetching = fetchingTargetId === target.id;
              const unseen = unseenCounts[target.id] || 0;
              const fresh = freshCounts[target.id] || 0;
              const done = doneCounts[target.id] || 0;
              const initials = target.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              const isChecked = selectedIds.has(target.id);

              return (
                <button
                  key={target.id}
                  onClick={() => {
                    if (selectionMode) toggleSelected(target.id);
                    else onSelectTarget(target);
                  }}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-3 text-left transition-all border-l-[3px] border-l-transparent',
                    isSelected && !selectionMode
                      ? 'bg-primary/[0.06] border-l-primary'
                      : 'hover:bg-muted/50',
                    selectionMode && isChecked && 'bg-primary/[0.08] border-l-primary',
                    !target.is_active && 'opacity-40',
                  )}
                >
                  {selectionMode && (
                    <Checkbox
                      checked={isChecked}
                      onCheckedChange={() => toggleSelected(target.id)}
                      onClick={(e) => e.stopPropagation()}
                      className="flex-shrink-0"
                    />
                  )}
                  {/* Avatar */}
                  <div className="relative flex-shrink-0">
                    <div className={cn(
                      'h-11 w-11 rounded-full flex items-center justify-center text-xs font-bold overflow-hidden',
                      isSelected
                        ? 'ring-2 ring-primary ring-offset-1'
                        : '',
                      target.avatar_url
                        ? 'bg-muted'
                        : 'bg-[#0A66C2]/10 text-[#0A66C2]',
                    )}>
                      {target.avatar_url ? (
                        <img src={target.avatar_url} alt={target.name} referrerPolicy="no-referrer" loading="lazy" className="h-full w-full object-cover" />
                      ) : isFetching ? (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                      ) : (
                        initials
                      )}
                    </div>
                    {/* Unseen badge */}
                    {unseen > 0 && (
                      <span className="absolute -top-1 -right-1 h-[18px] min-w-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[9px] font-bold flex items-center justify-center ring-2 ring-background">
                        {unseen}
                      </span>
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold text-[13px] leading-tight truncate flex items-center gap-1.5">
                      <span className="truncate">{target.name}</span>
                      {target.enrichment_status === 'pending' && (
                        <Loader2 className="h-3 w-3 animate-spin text-primary/60" />
                      )}
                    </div>
                    <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 h-4 px-1.5 rounded-full text-[9px] font-bold uppercase tracking-wide',
                          fresh > 0
                            ? 'bg-amber-100 text-amber-700'
                            : 'bg-muted text-muted-foreground/60',
                        )}
                        title={`${fresh} post${fresh === 1 ? '' : 's'} to engage with`}
                      >
                        <Sparkles className="h-2.5 w-2.5" />
                        {fresh} fresh
                      </span>
                      <span
                        className={cn(
                          'inline-flex items-center gap-1 h-4 px-1.5 rounded-full text-[9px] font-bold uppercase tracking-wide',
                          done > 0
                            ? 'bg-emerald-100 text-emerald-700'
                            : 'bg-muted text-muted-foreground/60',
                        )}
                        title={`${done} post${done === 1 ? '' : 's'} already liked or replied to`}
                      >
                        <CheckCircle2 className="h-2.5 w-2.5" />
                        {done} done
                      </span>
                    </div>
                    {target.title && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
                        {target.title}
                      </p>
                    )}
                    {target.company_name && (
                      <p className="text-[10px] text-muted-foreground/60 truncate leading-tight flex items-center gap-1 mt-0.5">
                        <Building2 className="h-2.5 w-2.5 flex-shrink-0" />
                        {target.company_name}
                      </p>
                    )}
                    {/* Fallback to headline if no separate title/company */}
                    {!target.title && !target.company_name && target.headline && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
                        {target.headline}
                      </p>
                    )}
                    {target.enrichment_status === 'failed' && (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          enrichTarget.mutate(target.id);
                        }}
                        className="text-[10px] text-destructive hover:underline mt-0.5"
                      >
                        Auto-fill failed · Retry
                      </button>
                    )}
                  </div>

                  {/* Meta */}
                  <div className="flex-shrink-0 text-right">
                    {target.last_fetched_at && (
                      <span className="text-[10px] text-muted-foreground/40 tabular-nums">
                        {timeAgoShort(target.last_fetched_at)}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add Profiles</DialogTitle>
            <DialogDescription>
              Add one or many LinkedIn profiles. Name, title, company, and photo are fetched automatically.
            </DialogDescription>
          </DialogHeader>

          <Tabs defaultValue="single" className="mt-2">
            <TabsList className="w-full">
              <TabsTrigger value="single" className="flex-1 gap-1.5 text-xs">
                <Plus className="h-3 w-3" />
                Single
              </TabsTrigger>
              <TabsTrigger value="bulk" className="flex-1 gap-1.5 text-xs">
                <Upload className="h-3 w-3" />
                Bulk Import
              </TabsTrigger>
            </TabsList>

            {/* Single add */}
            <TabsContent value="single" className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">LinkedIn URL</label>
                <Input
                  value={newUrl}
                  onChange={(e) => {
                    const val = e.target.value;
                    setNewUrl(val);
                    const match = val.match(/linkedin\.com\/in\/([^/?#]+)/);
                    if (match && (!newName || newName === prevAutoName.current)) {
                      const username = match[1].replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
                      setNewName(username);
                      prevAutoName.current = username;
                    }
                  }}
                  placeholder="https://linkedin.com/in/janesmith"
                  className="font-mono text-sm focus-visible:ring-primary/30"
                  autoFocus
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  Display Name <span className="text-muted-foreground/50">(auto-filled)</span>
                </label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Will be updated after fetch"
                  className="focus-visible:ring-primary/30"
                  onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                />
              </div>
              <div className="flex justify-end gap-2 pt-1">
                <Button variant="ghost" size="sm" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!newUrl.trim() || createTarget.isPending}
                  className="gap-1.5"
                >
                  {createTarget.isPending ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Plus className="h-3.5 w-3.5" />
                  )}
                  Add & Fetch
                </Button>
              </div>
            </TabsContent>

            {/* Bulk import */}
            <TabsContent value="bulk" className="space-y-3 pt-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                  LinkedIn URLs <span className="text-muted-foreground/50">(one per line)</span>
                </label>
                <Textarea
                  value={bulkUrls}
                  onChange={(e) => setBulkUrls(e.target.value)}
                  placeholder={"https://linkedin.com/in/janesmith\nhttps://linkedin.com/in/johndoe\nhttps://linkedin.com/in/sarahconnor"}
                  rows={6}
                  className="font-mono text-xs leading-relaxed focus-visible:ring-primary/30"
                />
                <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                  Paste LinkedIn profile URLs, one per line. You can also paste just usernames (e.g. "janesmith").
                  Duplicates are skipped automatically.
                </p>
              </div>

              {bulkImporting && (
                <div className="flex items-center gap-2 text-xs text-primary">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Importing {bulkProgress.done} of {bulkProgress.total}...
                </div>
              )}

              <div className="flex items-center justify-between pt-1">
                <span className="text-[10px] text-muted-foreground">
                  {bulkUrls.trim() ? `${bulkUrls.split(/[\n,]+/).filter((l) => l.trim()).length} URLs detected` : ''}
                </span>
                <div className="flex gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setShowAddDialog(false)}>Cancel</Button>
                  <Button
                    size="sm"
                    onClick={handleBulkImport}
                    disabled={!bulkUrls.trim() || bulkImporting}
                    className="gap-1.5"
                  >
                    {bulkImporting ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Upload className="h-3.5 w-3.5" />
                    )}
                    {bulkImporting ? 'Importing...' : 'Import All'}
                  </Button>
                </div>
              </div>
            </TabsContent>
          </Tabs>
        </DialogContent>
      </Dialog>

      {/* Reassign Dialog */}
      <Dialog open={showReassignDialog} onOpenChange={setShowReassignDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Move {selectedIds.size} profile{selectedIds.size === 1 ? '' : 's'}</DialogTitle>
            <DialogDescription>
              Reassign the selected profile{selectedIds.size === 1 ? '' : 's'} from <b>{publisher.name}</b> to another engager.
            </DialogDescription>
          </DialogHeader>

          <div className="py-2">
            <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Engager</label>
            <Select value={reassignPublisherId} onValueChange={setReassignPublisherId}>
              <SelectTrigger className="focus:ring-primary/30">
                <SelectValue placeholder="Choose an engager..." />
              </SelectTrigger>
              <SelectContent>
                {publishers
                  .filter((p) => p.id !== publisher.id)
                  .map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {p.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {publishers.filter((p) => p.id !== publisher.id).length === 0 && (
              <p className="text-[11px] text-muted-foreground mt-2">
                No other engagers in this workspace.
              </p>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" size="sm" onClick={() => setShowReassignDialog(false)}>Cancel</Button>
            <Button
              size="sm"
              onClick={() => {
                if (!reassignPublisherId) return;
                bulkReassignTargets.mutate(
                  { ids: Array.from(selectedIds), publisher_id: reassignPublisherId },
                  {
                    onSuccess: () => {
                      setShowReassignDialog(false);
                      exitSelectionMode();
                    },
                  },
                );
              }}
              disabled={!reassignPublisherId || bulkReassignTargets.isPending}
              className="gap-1.5"
            >
              {bulkReassignTargets.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ArrowRightLeft className="h-3.5 w-3.5" />
              )}
              Move
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
