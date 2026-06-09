import { useState } from 'react';
import { useEngagementPosts, useFetchTargetPosts, EngagementTarget, EngagementPost } from '@/hooks/useEngagement';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  ExternalLink, ThumbsUp, MessageSquare, Share2, MessageCircle,
  TrendingUp, RefreshCw, Loader2, Linkedin, Trash2, Users,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommentComposer } from './CommentComposer';
import { useEngagementTargets } from '@/hooks/useEngagement';

interface PostPanelProps {
  target: EngagementTarget | null;
  publisher: Publisher;
  isAdmin: boolean;
}

function timeAgo(dateStr: string | null): string {
  if (!dateStr) return '';
  const diff = Date.now() - new Date(dateStr).getTime();
  const hours = Math.floor(diff / 3600000);
  if (hours < 1) return 'just now';
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return `${Math.floor(days / 30)}mo ago`;
}

function engagementTier(post: EngagementPost): 'hot' | 'warm' | 'normal' {
  const total = post.likes_count + post.comments_count * 3 + post.shares_count * 5;
  if (total >= 200) return 'hot';
  if (total >= 50) return 'warm';
  return 'normal';
}

export function PostPanel({ target, publisher, isAdmin }: PostPanelProps) {
  const { currentWorkspace } = useWorkspace();
  const { posts, isLoading } = useEngagementPosts(target?.id || null);
  const { deleteTarget } = useEngagementTargets(publisher.id);
  const fetchPosts = useFetchTargetPosts();
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);
  const [isFetching, setIsFetching] = useState(false);
  const [deletingTarget, setDeletingTarget] = useState(false);

  const handleFetch = () => {
    if (!currentWorkspace || !target) return;
    setIsFetching(true);
    fetchPosts.mutate(
      { workspace_id: currentWorkspace.id, target_id: target.id },
      { onSettled: () => setIsFetching(false) },
    );
  };

  const handleDelete = () => {
    if (!target) return;
    if (deletingTarget) {
      deleteTarget.mutate(target.id);
      setDeletingTarget(false);
    } else {
      setDeletingTarget(true);
      setTimeout(() => setDeletingTarget(false), 3000);
    }
  };

  // Empty state — no target selected
  if (!target) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/15 mb-3" />
          <p className="text-sm font-medium text-muted-foreground">Select a profile</p>
          <p className="text-xs text-muted-foreground/60 mt-1">
            Choose a profile from the left to see their posts
          </p>
        </div>
      </div>
    );
  }

  // Extract initials
  const initials = target.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Profile header */}
      <div className="px-6 py-4 border-b bg-background flex items-center justify-between">
        <div className="flex items-center gap-4">
          {/* Large avatar */}
          <div className="h-12 w-12 rounded-full bg-[#0A66C2]/10 flex items-center justify-center flex-shrink-0 text-sm font-semibold text-[#0A66C2]">
            {target.avatar_url ? (
              <img src={target.avatar_url} alt={target.name} className="h-12 w-12 rounded-full object-cover" />
            ) : (
              initials
            )}
          </div>

          <div>
            <div className="flex items-center gap-2">
              <h2 className="font-display font-bold text-lg tracking-tight">{target.name}</h2>
              {target.linkedin_username && (
                <a
                  href={target.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0A66C2] hover:text-[#0A66C2]/80 transition-colors"
                  title="View on LinkedIn"
                >
                  <Linkedin className="h-4 w-4" />
                </a>
              )}
            </div>
            {target.headline && (
              <p className="text-sm text-muted-foreground">{target.headline}</p>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2">
          {target.last_fetched_at && (
            <span className="text-[11px] text-muted-foreground/50">
              Updated {timeAgo(target.last_fetched_at)}
            </span>
          )}
          {isAdmin && (
            <>
              <Button
                variant="outline"
                size="sm"
                className={cn(
                  'h-8 gap-1.5 text-xs font-medium',
                  isFetching && 'border-primary/30',
                )}
                disabled={isFetching}
                onClick={handleFetch}
              >
                {isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {isFetching ? 'Fetching...' : 'Fetch Posts'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 w-8 p-0',
                  deletingTarget
                    ? 'text-destructive bg-destructive/10'
                    : 'text-muted-foreground hover:text-destructive',
                )}
                onClick={handleDelete}
                title={deletingTarget ? 'Click again to confirm' : 'Remove profile'}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </>
          )}
        </div>
      </div>

      {/* Posts — scrollable */}
      <div className="flex-1 overflow-y-auto px-6 py-4">
        {isLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <Card key={i} className="p-4">
                <Skeleton className="h-4 w-3/4 mb-2" />
                <Skeleton className="h-4 w-full mb-2" />
                <Skeleton className="h-3 w-1/3" />
              </Card>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <div className="text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/20 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No posts yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1">
                Click <span className="font-semibold text-foreground">Fetch Posts</span> to pull their latest LinkedIn activity
              </p>
            </div>
          </div>
        ) : (
          <div className="space-y-2">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                {posts.length} post{posts.length !== 1 ? 's' : ''}
              </span>
            </div>

            {posts.map((post: EngagementPost) => {
              const tier = engagementTier(post);
              const isCommenting = commentingPostId === post.id;

              return (
                <div key={post.id}>
                  <Card
                    className={cn(
                      'p-4 transition-all duration-200 hover:shadow-sm group',
                      tier === 'hot' && 'border-l-[3px] border-l-primary bg-primary/[0.02]',
                      tier === 'warm' && 'border-l-[3px] border-l-primary/40',
                      isCommenting && 'ring-1 ring-primary/20',
                    )}
                  >
                    {tier === 'hot' && (
                      <div className="flex items-center gap-1 text-[10px] font-semibold text-primary uppercase tracking-wider mb-2">
                        <TrendingUp className="h-3 w-3" />
                        High engagement
                      </div>
                    )}

                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        {post.content ? (
                          <p className="text-sm leading-relaxed line-clamp-4 whitespace-pre-wrap text-foreground/90">
                            {post.content}
                          </p>
                        ) : (
                          <p className="text-sm text-muted-foreground italic">
                            Media post (image/video/document)
                          </p>
                        )}

                        <div className="flex items-center gap-4 mt-3">
                          {post.likes_count > 0 && (
                            <span className="flex items-center gap-1 text-xs text-rose-500/80 font-medium">
                              <ThumbsUp className="h-3.5 w-3.5" />
                              {post.likes_count.toLocaleString()}
                            </span>
                          )}
                          {post.comments_count > 0 && (
                            <span className="flex items-center gap-1 text-xs text-sky-500/80 font-medium">
                              <MessageSquare className="h-3.5 w-3.5" />
                              {post.comments_count.toLocaleString()}
                            </span>
                          )}
                          {post.shares_count > 0 && (
                            <span className="flex items-center gap-1 text-xs text-emerald-500/80 font-medium">
                              <Share2 className="h-3.5 w-3.5" />
                              {post.shares_count.toLocaleString()}
                            </span>
                          )}
                          <span className="text-xs text-muted-foreground ml-auto">
                            {timeAgo(post.published_at)}
                          </span>
                        </div>
                      </div>

                      <div className="flex flex-col items-end gap-1.5 flex-shrink-0">
                        {isAdmin && (
                          <Button
                            variant={isCommenting ? 'default' : 'outline'}
                            size="sm"
                            className={cn(
                              'h-8 gap-1.5 text-xs font-medium transition-all',
                              !isCommenting && 'opacity-70 group-hover:opacity-100',
                            )}
                            onClick={() => setCommentingPostId(isCommenting ? null : post.id)}
                          >
                            <MessageCircle className="h-3.5 w-3.5" />
                            Comment
                          </Button>
                        )}
                        <a
                          href={post.linkedin_post_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
                          title="Open on LinkedIn"
                        >
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      </div>
                    </div>
                  </Card>

                  {isCommenting && (
                    <div className="ml-5 mt-1.5 animate-in slide-in-from-top-2 fade-in duration-200">
                      <CommentComposer
                        post={post}
                        publisher={publisher}
                        onClose={() => setCommentingPostId(null)}
                      />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
