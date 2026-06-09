import { useState } from 'react';
import { useEngagementTargets, useFetchTargetPosts, EngagementTarget } from '@/hooks/useEngagement';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Plus, Trash2, RefreshCw, ChevronRight, Loader2, Users } from 'lucide-react';
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
  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState('');
  const [newUrl, setNewUrl] = useState('');
  const [newHeadline, setNewHeadline] = useState('');
  const [fetchingTargetId, setFetchingTargetId] = useState<string | null>(null);

  const handleAdd = () => {
    if (!newName.trim() || !newUrl.trim()) return;
    createTarget.mutate(
      { publisher_id: publisher.id, name: newName.trim(), linkedin_url: newUrl.trim(), headline: newHeadline.trim() || undefined },
      {
        onSuccess: () => {
          setNewName('');
          setNewUrl('');
          setNewHeadline('');
          setShowAddForm(false);
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

  if (isLoading) {
    return <div className="text-center py-12 text-muted-foreground">Loading targets...</div>;
  }

  return (
    <div className="space-y-4">
      {/* Add target */}
      {isAdmin && (
        <div>
          {showAddForm ? (
            <Card className="p-4 space-y-3">
              <div className="grid grid-cols-3 gap-2">
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="Name"
                  className="h-9"
                />
                <Input
                  value={newUrl}
                  onChange={(e) => setNewUrl(e.target.value)}
                  placeholder="LinkedIn URL (linkedin.com/in/...)"
                  className="h-9"
                />
                <Input
                  value={newHeadline}
                  onChange={(e) => setNewHeadline(e.target.value)}
                  placeholder="Headline (optional)"
                  className="h-9"
                />
              </div>
              <div className="flex gap-2">
                <Button size="sm" onClick={handleAdd} disabled={!newName.trim() || !newUrl.trim()}>
                  <Plus className="h-3.5 w-3.5 mr-1" />Add
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setShowAddForm(false)}>Cancel</Button>
              </div>
            </Card>
          ) : (
            <Button size="sm" variant="outline" onClick={() => setShowAddForm(true)} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              Add Person
            </Button>
          )}
        </div>
      )}

      {/* Target list */}
      {targets.length === 0 ? (
        <div className="text-center py-12">
          <Users className="h-8 w-8 mx-auto text-muted-foreground/50 mb-3" />
          <p className="text-muted-foreground">No engagement targets yet. Add people to start monitoring their posts.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {targets.map((target) => {
            const isExpanded = expandedTargetId === target.id;
            const isFetching = fetchingTargetId === target.id;

            return (
              <div key={target.id}>
                <Card
                  className={cn(
                    'p-3 cursor-pointer transition-colors hover:bg-muted/50',
                    isExpanded && 'ring-1 ring-primary/20 bg-primary/5',
                  )}
                  onClick={() => setExpandedTargetId(isExpanded ? null : target.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3 min-w-0">
                      <ChevronRight
                        className={cn('h-4 w-4 text-muted-foreground transition-transform', isExpanded && 'rotate-90')}
                      />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{target.name}</span>
                          {target.linkedin_username && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {target.linkedin_username}
                            </Badge>
                          )}
                          {!target.is_active && (
                            <Badge variant="outline" className="text-[10px]">Paused</Badge>
                          )}
                        </div>
                        {target.headline && (
                          <p className="text-xs text-muted-foreground truncate">{target.headline}</p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {target.last_fetched_at && (
                        <span className="text-[10px] text-muted-foreground">
                          Fetched {new Date(target.last_fetched_at).toLocaleDateString()}
                        </span>
                      )}

                      {isAdmin && (
                        <>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 gap-1 text-xs"
                            disabled={isFetching}
                            onClick={() => handleFetch(target)}
                          >
                            {isFetching ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <RefreshCw className="h-3 w-3" />
                            )}
                            Fetch Posts
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0 text-destructive hover:text-destructive"
                            onClick={() => deleteTarget.mutate(target.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </>
                      )}
                    </div>
                  </div>
                </Card>

                {/* Expanded: show posts */}
                {isExpanded && (
                  <div className="ml-6 mt-2 mb-4">
                    <PostFeed targetId={target.id} publisher={publisher} isAdmin={isAdmin} />
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
