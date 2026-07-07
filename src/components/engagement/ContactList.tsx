import { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEngagementTargets, useFetchTargetPosts, EngagementTarget } from '@/hooks/useEngagement';
import { useEngagementFolders, EngagementFolder } from '@/hooks/useEngagementFolders';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  Plus, Search, Loader2, Linkedin, Upload, CheckSquare, Trash2,
  ArrowRightLeft, X, Wand2, MoreHorizontal, Zap, ChevronDown,
  FolderPlus, Pencil, Check, FolderOpen, Folder,
} from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { ActivityRing } from './ActivityRing';
import type { FolderScope } from '@/pages/Engagement';

interface ContactListProps {
  publisher: Publisher;
  isAdmin: boolean;
  selectedTargetId: string | null;
  onSelectTarget: (target: EngagementTarget) => void;
  folderScope: FolderScope;
  onChangeFolderScope: (scope: FolderScope) => void;
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

const QUEUE_MAX = 5;

export function ContactList({
  publisher, isAdmin, selectedTargetId, onSelectTarget,
  folderScope, onChangeFolderScope,
}: ContactListProps) {
  const { currentWorkspace } = useWorkspace();
  const queryClient = useQueryClient();
  const {
    targets, isLoading, createTarget, enrichTarget, updateTarget,
    bulkDeleteTargets, bulkReassignTargets,
  } = useEngagementTargets(publisher.id);
  const { folders, createFolder, renameFolder, deleteFolder, moveTargetsToFolder } = useEngagementFolders(publisher.id);
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
  const [fetchingTargetId, setFetchingTargetId] = useState<string | null>(null);
  const prevAutoName = useRef<string>('');
  const [bulkUrls, setBulkUrls] = useState('');
  const [bulkImporting, setBulkImporting] = useState(false);
  const [bulkProgress, setBulkProgress] = useState({ done: 0, total: 0 });

  // Per-target counts (unseen / fresh / done)
  const { data: countMaps = { unseen: {}, fresh: {}, done: {} } } = useQuery({
    queryKey: ['target-counts', currentWorkspace?.id, publisher.id, targets.map((t) => `${t.id}:${t.last_seen_at}:${t.last_fetched_at}`).join(',')],
    queryFn: async () => {
      if (!currentWorkspace || targets.length === 0) return { unseen: {}, fresh: {}, done: {} };
      const unseen: Record<string, number> = {};
      const fresh: Record<string, number> = {};
      const done: Record<string, number> = {};
      for (const target of targets) {
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
  const freshCounts = countMaps.fresh as Record<string, number>;
  const doneCounts = countMaps.done as Record<string, number>;
  const totalFresh = Object.values(freshCounts).reduce((s, n) => s + n, 0);
  const totalDone = Object.values(doneCounts).reduce((s, n) => s + n, 0);

  // Folder scope filter first, then search
  const folderFiltered = useMemo(() => {
    if (folderScope === 'all') return targets;
    if (folderScope === 'unfiled') return targets.filter((t) => !t.folder_id);
    return targets.filter((t) => t.folder_id === folderScope);
  }, [targets, folderScope]);

  const searchFiltered = useMemo(() => {
    if (!search.trim()) return folderFiltered;
    const q = search.toLowerCase();
    return folderFiltered.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.headline || '').toLowerCase().includes(q) ||
        (t.company_name || '').toLowerCase().includes(q) ||
        (t.title || '').toLowerCase().includes(q) ||
        (t.linkedin_username || '').toLowerCase().includes(q),
    );
  }, [folderFiltered, search]);

  // Counts per folder for the strip (computed from full target list, ignores search)
  const folderCounts = useMemo(() => {
    const map: Record<string, number> = { all: targets.length, unfiled: 0 };
    for (const f of folders) map[f.id] = 0;
    for (const t of targets) {
      if (!t.folder_id) map.unfiled++;
      else if (map[t.folder_id] !== undefined) map[t.folder_id]++;
    }
    return map;
  }, [targets, folders]);

  // If the active folder scope no longer exists (e.g. folder deleted),
  // fall back to "all".
  useEffect(() => {
    if (folderScope === 'all' || folderScope === 'unfiled') return;
    if (!folders.some((f) => f.id === folderScope)) onChangeFolderScope('all');
  }, [folderScope, folders, onChangeFolderScope]);

  // Split into Queue (fresh > 0) and Watching (the rest)
  const queueList = useMemo(() => {
    return [...searchFiltered]
      .filter((t) => (freshCounts[t.id] || 0) > 0)
      .sort((a, b) => (freshCounts[b.id] || 0) - (freshCounts[a.id] || 0))
      .slice(0, QUEUE_MAX);
  }, [searchFiltered, freshCounts]);

  const watchingList = useMemo(() => {
    const queueIds = new Set(queueList.map((t) => t.id));
    return [...searchFiltered]
      .filter((t) => !queueIds.has(t.id))
      .sort((a, b) => {
        // Active (has any posts or done items) before Quiet (nothing at all)
        const aActive = (freshCounts[a.id] || 0) + (doneCounts[a.id] || 0);
        const bActive = (freshCounts[b.id] || 0) + (doneCounts[b.id] || 0);
        if ((aActive > 0) !== (bActive > 0)) return aActive > 0 ? -1 : 1;
        return a.name.localeCompare(b.name);
      });
  }, [searchFiltered, queueList, freshCounts, doneCounts]);

  const watchingActiveCount = useMemo(
    () => watchingList.filter((t) => (freshCounts[t.id] || 0) + (doneCounts[t.id] || 0) > 0).length,
    [watchingList, freshCounts, doneCounts],
  );

  // Resolve the default folder for new targets based on current scope.
  // "all" or "unfiled" -> NULL (unfiled). A specific folder -> that folder.
  const defaultFolderId = useMemo(() => {
    if (folderScope === 'all' || folderScope === 'unfiled') return null;
    return folderScope;
  }, [folderScope]);

  // Auto-fetch after adding a target
  const handleAdd = useCallback(() => {
    if (!newUrl.trim() || !currentWorkspace) return;
    const name = newName.trim() || newUrl.match(/linkedin\.com\/in\/([^/?#]+)/)?.[1]?.replace(/-/g, ' ')?.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';
    createTarget.mutate(
      { publisher_id: publisher.id, name, linkedin_url: newUrl.trim(), folder_id: defaultFolderId },
      {
        onSuccess: (data: any) => {
          setNewName('');
          setNewUrl('');
          setShowAddDialog(false);
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
  }, [newName, newUrl, currentWorkspace, publisher.id, createTarget, fetchPosts, defaultFolderId]);

  // Bulk import
  const handleBulkImport = useCallback(async () => {
    if (!currentWorkspace || !bulkUrls.trim()) return;
    const lines = bulkUrls.split(/[\n,]+/).map((l) => l.trim()).filter(Boolean);
    const urls = lines
      .map((line) => {
        if (line.includes('linkedin.com/in/')) return line;
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
          folder_id: defaultFolderId,
          skipEnrich: true,
        });
        if (row?.id) createdIds.push(row.id);
      } catch { /* skip duplicates */ }
      setBulkProgress({ done: i + 1, total: urls.length });
    }

    setBulkImporting(false);
    setBulkUrls('');
    setShowAddDialog(false);
    toast.success(`Imported ${createdIds.length} profiles — enriching in background`);

    // Kick off server-side bulk enrichment. Returns immediately; processing
    // continues in the edge function even if the tab is closed.
    if (createdIds.length > 0) {
      supabase.functions
        .invoke('bulk-enrich-targets', {
          body: { workspace_id: currentWorkspace.id, target_ids: createdIds },
        })
        .catch((err) => console.error('bulk-enrich-targets invoke failed', err));

      // Refresh UI a few times so users see profiles fill in.
      const refresh = () => {
        queryClient.invalidateQueries({ queryKey: ['engagement-posts'] });
        queryClient.invalidateQueries({ queryKey: ['engagement-targets'] });
        queryClient.invalidateQueries({ queryKey: ['target-counts'] });
      };
      [5000, 15000, 45000, 120000].forEach((ms) => setTimeout(refresh, ms));
    }
  }, [bulkUrls, currentWorkspace, publisher.id, createTarget]);

  // ⋮ Retry-failed actions
  const [reEnriching, setReEnriching] = useState(false);
  const handleReEnrichMissing = async () => {
    if (reEnriching) return;
    const missing = targets.filter((t) => t.enrichment_status !== 'succeeded');
    if (missing.length === 0) {
      toast.info('All profiles already enriched');
      return;
    }
    setReEnriching(true);
    toast.info(`Re-enriching ${missing.length} profile${missing.length === 1 ? '' : 's'}…`);
    const CONCURRENCY = 2;
    let idx = 0;
    let done = 0;
    let failed = 0;
    const worker = async () => {
      while (idx < missing.length) {
        const i = idx++;
        try {
          await enrichTarget.mutateAsync(missing[i].id);
        } catch {
          failed++;
        }
        done++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setReEnriching(false);
    if (failed > 0) toast.warning(`Re-enriched ${done - failed}/${missing.length}. ${failed} failed.`);
    else toast.success(`Re-enriched ${done} profile${done === 1 ? '' : 's'}`);
  };

  const [resyncing, setResyncing] = useState(false);
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
    toast.info(`Fetching posts for ${missing.length} profile${missing.length === 1 ? '' : 's'}…`);
    const CONCURRENCY = 2;
    let idx = 0;
    let done = 0;
    let failed = 0;
    let totalFound = 0;
    const worker = async () => {
      while (idx < missing.length) {
        const i = idx++;
        try {
          const res = await fetchPosts.mutateAsync({ workspace_id: currentWorkspace.id, target_id: missing[i].id });
          totalFound += res?.posts_found || 0;
        } catch {
          failed++;
        }
        done++;
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    setResyncing(false);
    if (failed > 0) toast.warning(`Synced ${done - failed}/${missing.length} · ${totalFound} posts · ${failed} failed`);
    else toast.success(`Synced ${done} profile${done === 1 ? '' : 's'} · ${totalFound} posts`);
  };

  const activeTargets = targets.filter((t) => t.is_active);
  const allAutoLike = activeTargets.length > 0 && activeTargets.every((t) => t.auto_like);
  const [bulkAutoLiking, setBulkAutoLiking] = useState(false);

  const kickAutoLike = useCallback(async (targetId: string) => {
    if (!currentWorkspace) return null;
    const { data, error } = await supabase.functions.invoke('auto-like-target-posts', {
      body: {
        workspace_id: currentWorkspace.id,
        target_id: targetId,
        trigger: 'toggle_all',
      },
    });
    if (error) throw error;
    return data as { success?: boolean; attempted?: number; liked?: number; failed?: number } | null;
  }, [currentWorkspace]);

  const handleToggleAllAutoLike = async (checked: boolean) => {
    if (activeTargets.length === 0) return;
    const changedTargets = activeTargets.filter((t) => t.auto_like !== checked);
    if (changedTargets.length === 0) return;

    setBulkAutoLiking(true);
    try {
      await Promise.all(
        changedTargets
          .map((t) => updateTarget.mutateAsync({ id: t.id, updates: { auto_like: checked } })),
      );

      if (checked) {
        const kicked = await Promise.allSettled(changedTargets.map((t) => kickAutoLike(t.id)));
        const liked = kicked.reduce((sum, r) => (
          r.status === 'fulfilled' ? sum + Number(r.value?.liked || 0) : sum
        ), 0);
        const failed = kicked.filter((r) => r.status === 'rejected').length
          + kicked.reduce((sum, r) => (
            r.status === 'fulfilled' ? sum + Number(r.value?.failed || 0) : sum
          ), 0);
        if (failed > 0) {
          toast.warning(`Auto-like enabled · ${liked} liked · ${failed} failed`);
        } else {
          toast.success(liked > 0
            ? `Auto-like enabled · ${liked} post${liked === 1 ? '' : 's'} liked`
            : `Auto-like enabled for ${changedTargets.length} profile${changedTargets.length === 1 ? '' : 's'}`);
        }
        return;
      }

      toast.success(checked ? `Auto-like enabled for ${activeTargets.length} profiles` : `Auto-like disabled for ${activeTargets.length} profiles`);
    } finally {
      setBulkAutoLiking(false);
    }
  };

  const missingCount = targets.filter((t) => t.enrichment_status !== 'succeeded').length;
  const missingPosts = targets.filter(
    (t) => t.is_active && !freshCounts[t.id] && !doneCounts[t.id] && t.last_fetched_at,
  ).length;
  const totalErrored = missingCount + (missingPosts > missingCount ? missingPosts - missingCount : 0);

  // Listen for the "Sync all" trigger dispatched from the Engagement command bar.
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail as { publisherId?: string } | undefined;
      if (detail?.publisherId && detail.publisherId !== publisher.id) return;
      (async () => {
        await handleReEnrichMissing();
        await handleResyncMissingPosts();
      })();
    };
    window.addEventListener('engagement:sync-all', handler);
    return () => window.removeEventListener('engagement:sync-all', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [publisher.id, targets, freshCounts, doneCounts, currentWorkspace?.id]);

  return (
    <>
      {/* Folder strip — sits above search, scopes everything below */}
      <FolderStrip
        folders={folders}
        folderCounts={folderCounts}
        activeScope={folderScope}
        onSelectScope={onChangeFolderScope}
        isAdmin={isAdmin}
        onCreate={(name) => createFolder.mutate(name)}
        onRename={(id, name) => renameFolder.mutate({ id, name })}
        onDelete={(id) => deleteFolder.mutate(id)}
      />

      {/* Header — search + actions */}
      <div className="px-3 pt-3 pb-2 space-y-2.5 border-b">
        {/* Search + +Add + List menu */}
        <div className="flex items-center gap-1.5">
          <div className="relative flex-1">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search profiles…"
              className="h-8 pl-8 text-sm bg-background focus-visible:ring-primary/30"
            />
          </div>
          {isAdmin && (
            <>
              <Button
                variant="ghost"
                size="sm"
                className="h-8 w-8 p-0 text-primary hover:bg-primary/10 flex-shrink-0"
                onClick={() => setShowAddDialog(true)}
                title="Add person"
              >
                <Plus className="h-4 w-4" />
              </Button>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 w-8 p-0 text-muted-foreground hover:text-foreground flex-shrink-0"
                    title="List actions"
                  >
                    <MoreHorizontal className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-56">
                  <DropdownMenuLabel className="text-xs">List actions</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={() => (selectionMode ? exitSelectionMode() : setSelectionMode(true))}
                  >
                    <CheckSquare className="h-3.5 w-3.5 mr-2" />
                    {selectionMode ? 'Cancel selection' : 'Select multiple'}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <div className="px-2 py-1.5 flex items-center justify-between gap-2">
                    <span className="inline-flex items-center gap-1.5 text-xs">
                      <Zap className={cn('h-3 w-3', allAutoLike ? 'fill-amber-500 text-amber-500' : 'text-muted-foreground')} />
                      Auto-like all
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
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onClick={async () => {
                      await handleReEnrichMissing();
                      await handleResyncMissingPosts();
                    }}
                    disabled={reEnriching || resyncing}
                  >
                    {reEnriching || resyncing ? (
                      <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                    ) : (
                      <Wand2 className="h-3.5 w-3.5 mr-2" />
                    )}
                    Sync all profiles & posts
                  </DropdownMenuItem>
                  {totalErrored > 0 && (
                    <>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem
                        onClick={async () => {
                          if (missingCount > 0) await handleReEnrichMissing();
                          if (missingPosts > 0) await handleResyncMissingPosts();
                        }}
                        disabled={reEnriching || resyncing}
                        className="text-amber-700 focus:text-amber-700"
                      >
                        {reEnriching || resyncing ? (
                          <Loader2 className="h-3.5 w-3.5 mr-2 animate-spin" />
                        ) : (
                          <Wand2 className="h-3.5 w-3.5 mr-2" />
                        )}
                        Retry {totalErrored} failed
                      </DropdownMenuItem>
                    </>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          )}
        </div>

        {/* Single-line summary */}
        <p className="text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground/70">
          <span className="text-amber-600 font-semibold">{totalFresh}</span> fresh
          <span className="mx-1.5 text-border">·</span>
          <span className="text-emerald-600 font-semibold">{totalDone}</span> done
          <span className="mx-1.5 text-border">·</span>
          <span>{targets.length}</span> watching
        </p>

        {/* Multi-select bar */}
        {selectionMode && (
          <div className="flex items-center gap-1.5 rounded-md bg-muted/50 border border-amber-300/40 px-2 py-1.5">
            <span className="text-[11px] font-semibold text-amber-700">
              {selectedIds.size} selected
            </span>
            <div className="flex-1" />
            <button
              type="button"
              onClick={() => {
                const all = [...queueList, ...watchingList];
                if (selectedIds.size === all.length) setSelectedIds(new Set());
                else setSelectedIds(new Set(all.map((t) => t.id)));
              }}
              className="text-[10px] text-amber-700 hover:underline font-medium"
            >
              {(() => {
                const all = [...queueList, ...watchingList];
                return selectedIds.size === all.length && all.length > 0 ? 'Clear' : 'All';
              })()}
            </button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 text-[11px] gap-1 px-2"
                  disabled={selectedIds.size === 0 || bulkReassignTargets.isPending || moveTargetsToFolder.isPending}
                >
                  <ArrowRightLeft className="h-3 w-3" />
                  Move
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuLabel className="text-[10px] uppercase tracking-wider text-muted-foreground/70">
                  Move to folder
                </DropdownMenuLabel>
                {folders.length === 0 ? (
                  <div className="px-2 py-1.5 text-[11px] text-muted-foreground italic">
                    No folders yet
                  </div>
                ) : (
                  folders.map((f) => (
                    <DropdownMenuItem
                      key={f.id}
                      onClick={() => {
                        moveTargetsToFolder.mutate(
                          { targetIds: Array.from(selectedIds), folderId: f.id },
                          { onSuccess: () => exitSelectionMode() },
                        );
                      }}
                    >
                      <Folder className="h-3 w-3 mr-2" />
                      {f.name}
                    </DropdownMenuItem>
                  ))
                )}
                <DropdownMenuItem
                  onClick={() => {
                    moveTargetsToFolder.mutate(
                      { targetIds: Array.from(selectedIds), folderId: null },
                      { onSuccess: () => exitSelectionMode() },
                    );
                  }}
                >
                  <FolderOpen className="h-3 w-3 mr-2 opacity-60" />
                  Unfiled
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={() => {
                    setReassignPublisherId('');
                    setShowReassignDialog(true);
                  }}
                >
                  <ArrowRightLeft className="h-3 w-3 mr-2" />
                  Move to engager…
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
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
      </div>

      {/* Body — queue + watching */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading…</div>
        ) : targets.length === 0 ? (
          <div className="p-8 text-center">
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
          </div>
        ) : (
          <div>
            {/* Today's queue */}
            {queueList.length > 0 && (
              <section className="pb-2">
                <header className="px-3 pt-3 pb-1.5 flex items-center justify-between">
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-amber-700">
                    Today's queue
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {queueList.length}
                  </span>
                </header>
                {queueList.map((target) => (
                  <TargetRow
                    key={target.id}
                    target={target}
                    isSelected={selectedTargetId === target.id}
                    isFetching={fetchingTargetId === target.id}
                    isChecked={selectedIds.has(target.id)}
                    selectionMode={selectionMode}
                    fresh={freshCounts[target.id] || 0}
                    done={doneCounts[target.id] || 0}
                    onClick={() => {
                      if (selectionMode) toggleSelected(target.id);
                      else onSelectTarget(target);
                    }}
                    onToggleSelect={() => toggleSelected(target.id)}
                    onRetryEnrich={() => enrichTarget.mutate(target.id)}
                    queueMode
                  />
                ))}
              </section>
            )}

            {/* Watching */}
            {watchingList.length > 0 && (
              <section>
                <header className="px-3 pt-3 pb-1.5 flex items-center justify-between border-t border-border/60">
                  <span className="text-[10px] font-mono uppercase tracking-[0.14em] text-muted-foreground/70">
                    Watching
                  </span>
                  <span className="text-[10px] font-mono text-muted-foreground/60">
                    {watchingList.length}
                  </span>
                </header>
                {watchingList.map((target, idx) => {
                  const isQuiet = (freshCounts[target.id] || 0) + (doneCounts[target.id] || 0) === 0;
                  const showQuietDivider = isQuiet && idx === watchingActiveCount && watchingActiveCount > 0;
                  return (
                    <div key={target.id}>
                      {showQuietDivider && (
                        <div className="px-3 pt-3 pb-1 flex items-center gap-2">
                          <span className="text-[9.5px] font-mono uppercase tracking-[0.14em] text-muted-foreground/50">
                            Quiet · no recent posts
                          </span>
                          <div className="flex-1 h-px bg-border/60" />
                        </div>
                      )}
                      <TargetRow
                        target={target}
                        isSelected={selectedTargetId === target.id}
                        isFetching={fetchingTargetId === target.id}
                        isChecked={selectedIds.has(target.id)}
                        selectionMode={selectionMode}
                        fresh={freshCounts[target.id] || 0}
                        done={doneCounts[target.id] || 0}
                        onClick={() => {
                          if (selectionMode) toggleSelected(target.id);
                          else onSelectTarget(target);
                        }}
                        onToggleSelect={() => toggleSelected(target.id)}
                        onRetryEnrich={() => enrichTarget.mutate(target.id)}
                      />
                    </div>
                  );
                })}
              </section>
            )}

            {queueList.length === 0 && watchingList.length === 0 && (
              <div className="p-6 text-center">
                <p className="text-xs text-muted-foreground">No results for "{search}"</p>
              </div>
            )}
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
                  Importing {bulkProgress.done} of {bulkProgress.total}…
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
                    {bulkImporting ? 'Importing…' : 'Import All'}
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
                <SelectValue placeholder="Choose an engager…" />
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

// -----------------------------------------------------------------------------
// TargetRow — used in both Queue and Watching sections
// -----------------------------------------------------------------------------

interface TargetRowProps {
  target: EngagementTarget;
  isSelected: boolean;
  isFetching: boolean;
  isChecked: boolean;
  selectionMode: boolean;
  fresh: number;
  done: number;
  queueMode?: boolean;
  onClick: () => void;
  onToggleSelect: () => void;
  onRetryEnrich: () => void;
}

function TargetRow({
  target, isSelected, isFetching, isChecked, selectionMode,
  fresh, done, queueMode, onClick, onToggleSelect, onRetryEnrich,
}: TargetRowProps) {
  const initials = target.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-all border-l-2 border-l-transparent',
        isSelected && !selectionMode && 'bg-amber-50/40 border-l-amber-500',
        !isSelected && 'hover:bg-muted/40',
        selectionMode && isChecked && 'bg-amber-50/60 border-l-amber-500',
        !target.is_active && 'opacity-40',
      )}
    >
      {selectionMode && (
        <Checkbox
          checked={isChecked}
          onCheckedChange={onToggleSelect}
          onClick={(e) => e.stopPropagation()}
          className="flex-shrink-0"
        />
      )}

      {/* Avatar (ring on queue mode only) */}
      <div className="flex-shrink-0">
        {queueMode ? (
          <ActivityRing fresh={fresh} done={done} size={40}>
            <AvatarInner target={target} initials={initials} isFetching={isFetching} />
          </ActivityRing>
        ) : (
          <div className={cn(
            'h-9 w-9 rounded-full overflow-hidden flex items-center justify-center text-[11px] font-bold',
            target.avatar_url ? 'bg-muted' : 'bg-muted text-foreground/60',
          )}>
            <AvatarInner target={target} initials={initials} isFetching={isFetching} />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-display font-semibold text-[13px] leading-tight truncate">
            {target.name}
          </span>
          {target.enrichment_status === 'pending' && (
            <Loader2 className="h-3 w-3 animate-spin text-primary/60 flex-shrink-0" />
          )}
        </div>
        {(target.title || target.company_name) ? (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
            {[target.title, target.company_name].filter(Boolean).join(' · ')}
          </p>
        ) : target.headline ? (
          <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
            {target.headline}
          </p>
        ) : null}
        {target.enrichment_status === 'failed' && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRetryEnrich();
            }}
            className="text-[10px] text-destructive hover:underline mt-0.5"
          >
            Sync failed · Retry
          </button>
        )}
      </div>

      {/* Right meta */}
      <div className="flex-shrink-0 flex flex-col items-end gap-0.5">
        {queueMode && fresh > 0 && (
          <span className="text-[10px] font-mono font-semibold text-amber-700 tabular-nums">
            {fresh} fresh
          </span>
        )}
        {!queueMode && fresh > 0 && (
          <span className="h-1.5 w-1.5 rounded-full bg-amber-500" title={`${fresh} fresh`} />
        )}
        {target.last_fetched_at && (
          <span className="text-[10px] text-muted-foreground/40 tabular-nums">
            {timeAgoShort(target.last_fetched_at)}
          </span>
        )}
      </div>
    </button>
  );
}

function AvatarInner({ target, initials, isFetching }: { target: EngagementTarget; initials: string; isFetching: boolean }) {
  if (target.avatar_url) {
    return (
      <img
        src={target.avatar_url}
        alt={target.name}
        referrerPolicy="no-referrer"
        loading="lazy"
        className="h-full w-full object-cover rounded-full"
      />
    );
  }
  if (isFetching) {
    return <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />;
  }
  return <span className="text-foreground/60">{initials}</span>;
}

// -----------------------------------------------------------------------------
// FolderStrip — horizontal pills for All / each folder / Unfiled / + New
// -----------------------------------------------------------------------------

interface FolderStripProps {
  folders: EngagementFolder[];
  folderCounts: Record<string, number>;
  activeScope: FolderScope;
  isAdmin: boolean;
  onSelectScope: (scope: FolderScope) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onDelete: (id: string) => void;
}

function FolderStrip({
  folders, folderCounts, activeScope, isAdmin,
  onSelectScope, onCreate, onRename, onDelete,
}: FolderStripProps) {
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const startCreate = () => { setCreating(true); setNewName(''); };
  const submitCreate = () => {
    const n = newName.trim();
    if (!n) { setCreating(false); return; }
    onCreate(n);
    setCreating(false);
    setNewName('');
  };

  const startRename = (id: string, current: string) => {
    setEditingId(id);
    setEditingName(current);
  };
  const submitRename = () => {
    if (editingId && editingName.trim()) {
      onRename(editingId, editingName.trim());
    }
    setEditingId(null);
    setEditingName('');
  };

  const hasUnfiled = (folderCounts.unfiled || 0) > 0;

  return (
    <div className="px-3 pt-3 pb-1.5 border-b bg-background flex items-center gap-1.5 overflow-x-auto">
      {/* All */}
      <FolderPill
        label="All"
        count={folderCounts.all || 0}
        active={activeScope === 'all'}
        onClick={() => onSelectScope('all')}
      />

      {/* Custom folders */}
      {folders.map((f) => {
        const isActive = activeScope === f.id;
        const isEditing = editingId === f.id;
        const isConfirming = confirmDeleteId === f.id;
        return (
          <div key={f.id} className="relative inline-flex items-center group">
            {isEditing ? (
              <input
                type="text"
                value={editingName}
                onChange={(e) => setEditingName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') submitRename();
                  if (e.key === 'Escape') { setEditingId(null); setEditingName(''); }
                }}
                onBlur={submitRename}
                autoFocus
                className="h-7 px-2 rounded-full text-[11px] font-semibold bg-amber-50 border border-amber-300 text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 w-28"
              />
            ) : (
              <FolderPill
                label={f.name}
                count={folderCounts[f.id] || 0}
                active={isActive}
                onClick={() => onSelectScope(f.id)}
                icon={isActive ? <FolderOpen className="h-3 w-3" /> : <Folder className="h-3 w-3" />}
              />
            )}
            {isAdmin && !isEditing && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    className={cn(
                      'ml-0.5 h-5 w-5 inline-flex items-center justify-center rounded text-muted-foreground/50 hover:text-foreground hover:bg-muted',
                      isActive ? 'opacity-100' : 'opacity-0 group-hover:opacity-100',
                    )}
                    title="Folder actions"
                  >
                    <MoreHorizontal className="h-3 w-3" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="start" className="w-40">
                  <DropdownMenuItem onClick={() => startRename(f.id, f.name)}>
                    <Pencil className="h-3 w-3 mr-2" />
                    Rename
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    className={cn('text-destructive focus:text-destructive', isConfirming && 'bg-destructive/10')}
                    onSelect={(e) => {
                      e.preventDefault();
                      if (confirmDeleteId === f.id) {
                        onDelete(f.id);
                        setConfirmDeleteId(null);
                      } else {
                        setConfirmDeleteId(f.id);
                        setTimeout(() => setConfirmDeleteId((prev) => (prev === f.id ? null : prev)), 3000);
                      }
                    }}
                  >
                    <Trash2 className="h-3 w-3 mr-2" />
                    {isConfirming ? 'Click again to confirm' : 'Delete'}
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </div>
        );
      })}

      {/* Unfiled — only when relevant */}
      {hasUnfiled && (
        <FolderPill
          label="Unfiled"
          count={folderCounts.unfiled || 0}
          active={activeScope === 'unfiled'}
          onClick={() => onSelectScope('unfiled')}
          muted
        />
      )}

      {/* + New folder */}
      {isAdmin && (creating ? (
        <input
          type="text"
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') submitCreate();
            if (e.key === 'Escape') { setCreating(false); setNewName(''); }
          }}
          onBlur={submitCreate}
          autoFocus
          placeholder="Folder name"
          className="h-7 px-2 rounded-full text-[11px] font-semibold bg-amber-50 border border-amber-300 text-amber-800 focus:outline-none focus:ring-2 focus:ring-amber-300 w-28"
        />
      ) : (
        <button
          type="button"
          onClick={startCreate}
          className="inline-flex items-center justify-center h-7 w-7 rounded-full text-muted-foreground/70 hover:text-primary hover:bg-primary/10 flex-shrink-0"
          title="New folder"
        >
          <FolderPlus className="h-3.5 w-3.5" />
        </button>
      ))}
    </div>
  );
}

interface FolderPillProps {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon?: React.ReactNode;
  muted?: boolean;
}

function FolderPill({ label, count, active, onClick, icon, muted }: FolderPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'inline-flex items-center gap-1.5 h-7 px-2.5 rounded-full text-[11px] font-semibold transition-colors whitespace-nowrap flex-shrink-0',
        active
          ? 'bg-amber-500 text-white shadow-sm'
          : muted
            ? 'bg-muted/40 text-muted-foreground/70 hover:bg-muted'
            : 'bg-muted/60 text-muted-foreground hover:text-foreground hover:bg-muted',
      )}
    >
      {icon}
      {label}
      <span className={cn(
        'tabular-nums text-[10px] font-mono',
        active ? 'text-white/85' : 'text-muted-foreground/60',
      )}>
        {count}
      </span>
    </button>
  );
}
