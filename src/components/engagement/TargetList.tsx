import { useState } from 'react';
import { useEngagementTargets, useFetchTargetPosts, EngagementTarget } from '@/hooks/useEngagement';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Plus, Trash2, RefreshCw, ChevronRight, Loader2, Users, Linkedin } from 'lucide-react';
import { cn } from '@/lib/utils';
import { PostFeed } from './PostFeed';

interface TargetListProps {
  publisher: Publisher;
  isAdmin: boolean;
}

export function TargetList({ publisher, isAdmin }: TargetListProps) {
  const { currentWorkspace } = useWorkspace();
  const { targets, isLoading, createTarget, deleteTarget } = useEngagementTargets(publisher.id);
  const fetchPosts = useFetchTargetPosts();

  const [expandedTargetId, setExpandedTargetId] = useState<string | null>(null);
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newHeadline, setNewHeadline] = useState('');
  const [fetchingTargetId, setFetchingTargetId] = useState<string | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    createTarget.mutate(
      { publisher_id: publisher.id, name: newName.trim(), linkedin_url: newUrl.trim(), headline: newHeadline.trim() || undefined },
      {
        onSuccess: (data: any) => {
          setNewName('');
          setNewUrl('');
          setNewHeadline('');
          setShowAddDialog(false);
          if (data?.id && currentWorkspace) {
            setFetchingTargetId(data.id);
            fetchPosts.mutate(
              { workspace_id: currentWorkspace.id, target_id: data.id },
              { onSettled: () => setFetchingTargetId(null) },
            );
          }
        },
      },
    );
  };

  const handleFetch = (target: EngagementTarget) => {
    if (!currentWorkspace) return;
    setFetchingTargetId(target.id);
    fetchPosts.mutate(
      { workspace_id: currentWorkspace.id, target_id: target.id },
      {
        onSettled: () => setFetchingTargetId(null),
        onSuccess: () => setExpandedTargetId(target.id),
      },
    );
  };

  const handleDelete = (id: string) => {
    if (deletingId === id) {
      deleteTarget.mutate(id);
      setDeletingId(null);
    } else {
      setDeletingId(id);
      setTimeout(() => setDeletingId(null), 3000);
    }
  };

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading targets...</div>;
  }

  return (
    <div className="space-y-3">
      {/* Add target button */}
      {isAdmin && (
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddDialog(true)}
          className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10 hover:text-primary"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Person
        </Button>
      )}

      {/* Target list */}
      {targets.length === 0 ? (
        <div className="text-center py-16 border border-dashed border-border rounded-lg">
          <Users className="h-8 w-8 mx-auto text-muted-foreground/30 mb-3" />
          <p className="text-sm font-medium text-muted-foreground mb-1">No engagement targets yet</p>
          <p className="text-xs text-muted-foreground/70">
            Add people to monitor their LinkedIn posts and engage with them.
          </p>
        </div>
      ) : (
        <div className="space-y-1.5">
          {targets.map((target) => {
            const isExpanded = expandedTargetId === target.id;
            const isFetching = fetchingTargetId === target.id;

            return (
              <div key={target.id}>
                <Card
                  className={cn(
                    'px-4 py-3 cursor-pointer transition-all duration-200 hover:shadow-sm',
                    isExpanded
                      ? 'border-l-[3px] border-l-primary bg-primary/[0.03] shadow-sm'
                      : 'hover:border-l-[3px] hover:border-l-primary/30',
                    !target.is_active && 'opacity-50',
                  )}
                  onClick={() => setExpandedTargetId(isExpanded ? null : target.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Avatar placeholder with LinkedIn icon */}
                      <div className="h-9 w-9 rounded-full bg-[#0A66C2]/10 flex items-center justify-center flex-shrink-0">
                        <Linkedin className="h-4 w-4 text-[#0A66C2]" />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-display font-semibold text-[15px] tracking-tight">
                            {target.name}
                          </span>
                          {target.linkedin_username && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0 font-mono">
                              /{target.linkedin_username}
                            </Badge>
                          )}
                          {!target.is_active && (
                            <Badge variant="outline" className="text-[10px]">Paused</Badge>
                          )}
                        </div>
                        {target.headline && (
                          <p className="text-xs text-muted-foreground truncate max-w-[400px]">{target.headline}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {target.last_fetched_at && (
                        <span className="text-[10px] text-muted-foreground/60 tabular-nums">
                          {new Date(target.last_fetched_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </span>
                      )}

                      {isAdmin && (
                        <>
                          <Button
                            variant="outline"
                            size="sm"
                            className={cn(
                              'h-7 gap-1.5 text-xs font-medium transition-all',
                              isFetching && 'border-primary/30',
                            )}
                            disabled={isFetching}
                            onClick={() => handleFetch(target)}
                          >
                            {isFetching ? (
                              <Loader2 className="h-3 w-3 animate-spin text-primary" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            {isFetching ? 'Fetching...' : 'Fetch'}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className={cn(
                              'h-7 w-7 p-0 transition-colors',
                              deletingId === target.id
                                ? 'text-destructive bg-destructive/10'
                                : 'text-muted-foreground hover:text-destructive',
                            )}
                            onClick={() => handleDelete(target.id)}
                            title={deletingId === target.id ? 'Click again to confirm' : 'Remove'}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}

                      <ChevronRight
                        className={cn(
                          'h-4 w-4 text-muted-foreground/40 transition-transform duration-200',
                          isExpanded && 'rotate-90',
                        )}
                      />
                    </div>
                  </div>
                </Card>

                {/* Expanded posts */}
                {isExpanded && (
                  <div className="ml-5 pl-5 mt-1 mb-4 border-l-2 border-primary/10 animate-in slide-in-from-top-2 fade-in duration-200">
                    <PostFeed targetId={target.id} publisher={publisher} isAdmin={isAdmin} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add Person Dialog */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="font-display">Add Person to Engage</DialogTitle>
            <DialogDescription>
              Add a LinkedIn profile to monitor their posts and engage as {publisher.name}.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">Name</label>
              <Input
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                placeholder="e.g. John Doe"
                className="focus-visible:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">LinkedIn URL</label>
              <Input
                value={newUrl}
                onChange={(e) => setNewUrl(e.target.value)}
                placeholder="https://linkedin.com/in/johndoe"
                className="font-mono text-sm focus-visible:ring-primary/30"
              />
            </div>
            <div>
              <label className="text-xs font-medium text-muted-foreground mb-1.5 block">
                Headline <span className="text-muted-foreground/50">(optional)</span>
              </label>
              <Input
                value={newHeadline}
                onChange={(e) => setNewHeadline(e.target.value)}
                placeholder="e.g. CEO at Acme Corp"
                className="focus-visible:ring-primary/30"
              />
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
              Add Person
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
