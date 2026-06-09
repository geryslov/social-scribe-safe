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
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Search, Loader2, Linkedin, RefreshCw, Building2 } from 'lucide-react';
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

  // Unseen post counts
  const { data: unseenCounts = {} } = useQuery({
    queryKey: ['unseen-counts', currentWorkspace?.id, publisher.id, targets.map((t) => `${t.id}:${t.last_seen_at}`).join(',')],
    queryFn: async () => {
      if (!currentWorkspace || targets.length === 0) return {};
      const counts: Record<string, number> = {};
      for (const target of targets) {
        let query = (supabase as any)
          .from('engagement_posts')
          .select('id', { count: 'exact', head: true })
          .eq('target_id', target.id);
        if (target.last_seen_at) {
          query = query.gt('created_at', target.last_seen_at);
        }
        const { count } = await query;
        if (count && count > 0) counts[target.id] = count;
      }
      return counts;
    },
    enabled: !!currentWorkspace && targets.length > 0,
  });

  const filtered = useMemo(() => {
    if (!search.trim()) return targets;
    const q = search.toLowerCase();
    return targets.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.headline || '').toLowerCase().includes(q) ||
        (t.company_name || '').toLowerCase().includes(q) ||
        (t.title || '').toLowerCase().includes(q) ||
        (t.linkedin_username || '').toLowerCase().includes(q),
    );
  }, [targets, search]);

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
                    <div className="font-display font-semibold text-[13px] leading-tight truncate">
                      {target.name}
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
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display">Add Profile</DialogTitle>
            <DialogDescription>
              Paste a LinkedIn profile URL. Name, title, company, and photo will be fetched automatically.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">LinkedIn URL</label>
              <Input
                value={newUrl}
                onChange={(e) => {
                  const val = e.target.value;
                  setNewUrl(val);
                  // Auto-extract name from URL
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
                Display Name <span className="text-muted-foreground/50">(auto-filled, editable)</span>
              </label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="Will be updated after fetch"
                className="focus-visible:ring-primary/30"
                onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
              />
              <p className="text-[10px] text-muted-foreground/50 mt-1.5">
                Real name, title, company, and photo are fetched from LinkedIn after adding.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
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
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
