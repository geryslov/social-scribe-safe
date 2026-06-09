import { useState, useMemo } from 'react';
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
import { Plus, Search, Loader2, Linkedin, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ContactListProps {
  publisher: Publisher;
  isAdmin: boolean;
  selectedTargetId: string | null;
  onSelectTarget: (target: EngagementTarget) => void;
}

function timeAgoShort(dateStr: string | null): string {
  if (!dateStr) return 'Never';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'Just now';
  if (hours < 24) return `${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d`;
  return `${Math.floor(days / 7)}w`;
}

export function ContactList({ publisher, isAdmin, selectedTargetId, onSelectTarget }: ContactListProps) {
  const { currentWorkspace } = useWorkspace();
  const { targets, isLoading, createTarget } = useEngagementTargets(publisher.id);
  const fetchPosts = useFetchTargetPosts();

  const [search, setSearch] = useState('');
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newHeadline, setNewHeadline] = useState('');
  const [newCompany, setNewCompany] = useState('');
  const [fetchingAll, setFetchingAll] = useState(false);

  const filtered = useMemo(() => {
    if (!search.trim()) return targets;
    const q = search.toLowerCase();
    return targets.filter(
      (t) =>
        t.name.toLowerCase().includes(q) ||
        (t.headline || '').toLowerCase().includes(q) ||
        (t.linkedin_username || '').toLowerCase().includes(q),
    );
  }, [targets, search]);

  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    createTarget.mutate(
      {
        publisher_id: publisher.id,
        name: newName.trim(),
        linkedin_url: newUrl.trim(),
        headline: [newHeadline.trim(), newCompany.trim()].filter(Boolean).join(' at ') || undefined,
      },
      {
        onSuccess: () => {
          setNewName('');
          setNewUrl('');
          setNewHeadline('');
          setNewCompany('');
          setShowAddDialog(false);
        },
      },
    );
  };

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
      {/* Header + search */}
      <div className="p-3 space-y-2 border-b">
        <div className="flex items-center justify-between">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
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
                title="Fetch all profiles"
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
            placeholder="Search profiles..."
            className="h-8 pl-8 text-sm bg-background focus-visible:ring-primary/30"
          />
        </div>
      </div>

      {/* Contact list — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-4 text-center text-sm text-muted-foreground">Loading...</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-center">
            {targets.length === 0 ? (
              <>
                <Linkedin className="h-8 w-8 mx-auto text-muted-foreground/20 mb-2" />
                <p className="text-xs text-muted-foreground">No profiles added yet</p>
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
              // Extract initials for avatar
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
                    'w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors border-l-[3px] border-l-transparent',
                    isSelected
                      ? 'bg-primary/[0.06] border-l-primary'
                      : 'hover:bg-muted/50',
                    !target.is_active && 'opacity-50',
                  )}
                >
                  {/* Avatar */}
                  <div className={cn(
                    'h-10 w-10 rounded-full flex items-center justify-center flex-shrink-0 text-xs font-semibold',
                    isSelected
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-[#0A66C2]/10 text-[#0A66C2]',
                  )}>
                    {target.avatar_url ? (
                      <img
                        src={target.avatar_url}
                        alt={target.name}
                        className="h-10 w-10 rounded-full object-cover"
                      />
                    ) : (
                      initials
                    )}
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="font-display font-semibold text-sm leading-tight truncate">
                      {target.name}
                    </div>
                    {target.headline && (
                      <p className="text-[11px] text-muted-foreground truncate mt-0.5 leading-tight">
                        {target.headline}
                      </p>
                    )}
                  </div>

                  {/* Last fetched */}
                  <div className="flex-shrink-0 text-right">
                    <span className="text-[10px] text-muted-foreground/50 tabular-nums">
                      {timeAgoShort(target.last_fetched_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Add Person Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add Profile</DialogTitle>
            <DialogDescription>
              Add a LinkedIn profile to monitor and engage as {publisher.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Full Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="focus-visible:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">LinkedIn URL</label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://linkedin.com/in/janesmith"
                className="font-mono text-sm focus-visible:ring-primary/30"
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Title</label>
                <Input
                  value={newHeadline}
                  onChange={(e) => setNewHeadline(e.target.value)}
                  placeholder="e.g. VP Marketing"
                  className="focus-visible:ring-primary/30"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Company</label>
                <Input
                  value={newCompany}
                  onChange={(e) => setNewCompany(e.target.value)}
                  placeholder="e.g. Acme Corp"
                  className="focus-visible:ring-primary/30"
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddDialog(false)}>Cancel</Button>
            <Button
              onClick={handleAdd}
              disabled={!newName.trim() || !newUrl.trim() || createTarget.isPending}
              className="gap-1.5"
            >
              {createTarget.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Plus className="h-3.5 w-3.5" />
              )}
              Add Profile
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
