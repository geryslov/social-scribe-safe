import { useState, useMemo, useCallback, useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useEngagementTargets, useFetchTargetPosts, EngagementTarget } from '@/hooks/useEngagement';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { toast } from 'sonner';
import { Plus, Search, Loader2, Linkedin, RefreshCw, Building2, Upload } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
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
  const { targets, isLoading, createTarget, enrichTarget } = useEngagementTargets(publisher.id);
  const fetchPosts = useFetchTargetPosts();

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

  // Unseen post counts + fresh (not engaged) post counts per target
  const { data: countMaps = { unseen: {}, fresh: {} } } = useQuery({
    queryKey: ['target-counts', currentWorkspace?.id, publisher.id, targets.map((t) => `${t.id}:${t.last_seen_at}`).join(',')],
    queryFn: async () => {
      if (!currentWorkspace || targets.length === 0) return { unseen: {}, fresh: {} };
      const unseen: Record<string, number> = {};
      const fresh: Record<string, number> = {};
      for (const target of targets) {
        // Unseen (newly synced since last visit)
        let unseenQ = (supabase as any)
          .from('engagement_posts')
          .select('id', { count: 'exact', head: true })
          .eq('target_id', target.id);
        if (target.last_seen_at) unseenQ = unseenQ.gt('created_at', target.last_seen_at);
        const { count: unseenCount } = await unseenQ;
        if (unseenCount && unseenCount > 0) unseen[target.id] = unseenCount;

        // Fresh (not commented and not liked yet — net new to engage with)
        const { count: freshCount } = await (supabase as any)
          .from('engagement_posts')
          .select('id', { count: 'exact', head: true })
          .eq('target_id', target.id)
          .eq('is_commented', false)
          .eq('is_liked', false);
        if (freshCount && freshCount > 0) fresh[target.id] = freshCount;
      }
      return { unseen, fresh };
    },
    enabled: !!currentWorkspace && targets.length > 0,
  });
  const unseenCounts = countMaps.unseen as Record<string, number>;
  const freshCounts = countMaps.fresh as Record<string, number>;
  const totalFresh = Object.values(freshCounts).reduce((s, n) => s + n, 0);
  const targetsWithFresh = Object.keys(freshCounts).length;

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

    for (let i = 0; i < urls.length; i++) {
      const url = urls[i];
      const match = url.match(/linkedin\.com\/in\/([^/?#]+)/);
      const name = match?.[1]?.replace(/-/g, ' ')?.replace(/\b\w/g, (c) => c.toUpperCase()) || 'Unknown';

      try {
        await createTarget.mutateAsync({ publisher_id: publisher.id, name, linkedin_url: url });
      } catch {
        // Skip duplicates or errors, continue
      }
      setBulkProgress({ done: i + 1, total: urls.length });
    }

    setBulkImporting(false);
    setBulkUrls('');
    setShowAddDialog(false);
    toast.success(`Imported ${urls.length} profiles — enriching in background`);
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

  return (
    <>
      {/* Header */}
      <div className="p-3 space-y-2 border-b">
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Profiles ({targets.length})
          </span>
          <div className="flex gap-1">
            {isAdmin && targets.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 w-7 p-0 text-muted-foreground hover:text-primary"
                onClick={handleFetchAll}
                disabled={fetchingAll}
                title="Sync all profiles"
              >
                {fetchingAll ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
              </Button>
            )}
            {isAdmin && (
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

        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/50" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search..."
            className="h-8 pl-8 text-sm bg-background focus-visible:ring-primary/30"
          />
        </div>
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
              const initials = target.name
                .split(' ')
                .map((w) => w[0])
                .join('')
                .slice(0, 2)
                .toUpperCase();

              return (
                <button
                  key={target.id}
                  onClick={() => onSelectTarget(target)}
                  className={cn(
                    'w-full flex items-center gap-3 px-3 py-3 text-left transition-all border-l-[3px] border-l-transparent',
                    isSelected
                      ? 'bg-primary/[0.06] border-l-primary'
                      : 'hover:bg-muted/50',
                    !target.is_active && 'opacity-40',
                  )}
                >
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
                      {target.name}
                      {target.enrichment_status === 'pending' && (
                        <Loader2 className="h-3 w-3 animate-spin text-primary/60" />
                      )}
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
    </>
  );
}
