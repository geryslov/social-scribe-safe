import { useState } from 'react';
import { useEngagementPosts, useFetchTargetPosts, EngagementTarget, EngagementPost } from '@/hooks/useEngagement';
import { useWorkspace } from '@/hooks/useWorkspace';
import { Publisher } from '@/hooks/usePublishers';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  ExternalLink, ThumbsUp, MessageSquare, Share2, MessageCircle,
  TrendingUp, RefreshCw, Loader2, Linkedin, Trash2, Users,
  CheckCircle2, Building2, Briefcase,
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

  // Empty — no target
  if (!target) {
    return (
      <div className="flex-1 flex items-center justify-center bg-muted/10">
        <div className="text-center">
          <Users className="h-12 w-12 mx-auto text-muted-foreground/10 mb-3" />
          <p className="text-sm font-medium text-muted-foreground/60">Select a profile to view their posts</p>
        </div>
      </div>
    );
  }

  const initials = target.name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Profile card header */}
      <div className="px-6 py-5 border-b bg-background">
        <div className="flex items-start justify-between">
          <div className="flex items-start gap-4">
            {/* Large avatar */}
            <div className="h-16 w-16 rounded-full flex items-center justify-center flex-shrink-0 overflow-hidden bg-[#0A66C2]/10 text-[#0A66C2] text-lg font-bold">
              {target.avatar_url ? (
                <img src={target.avatar_url} alt={target.name} className="h-full w-full object-cover" />
              ) : (
                initials
              )}
            </div>

            <div className="pt-0.5">
              <div className="flex items-center gap-2">
                <h2 className="font-display font-bold text-xl tracking-tight">{target.name}</h2>
                <a
                  href={target.linkedin_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[#0A66C2] hover:text-[#0A66C2]/70 transition-colors"
                  title="View on LinkedIn"
                >
                  <Linkedin className="h-4.5 w-4.5" />
                </a>
              </div>

              {/* Title + Company */}
              <div className="flex items-center gap-3 mt-1 text-sm text-muted-foreground">
                {target.title && (
                  <span className="flex items-center gap-1.5">
                    <Briefcase className="h-3.5 w-3.5 text-muted-foreground/50" />
                    {target.title}
                  </span>
                )}
                {target.company_name && (
                  <span className="flex items-center gap-1.5">
                    <Building2 className="h-3.5 w-3.5 text-muted-foreground/50" />
                    {target.company_name}
                  </span>
                )}
              </div>

              {/* Fallback headline */}
              {!target.title && !target.company_name && target.headline && (
                <p className="text-sm text-muted-foreground mt-1">{target.headline}</p>
              )}

              {/* Meta row */}
              {target.last_fetched_at && (
                <p className="text-[11px] text-muted-foreground/40 mt-1.5">
                  Last synced {timeAgo(target.last_fetched_at)}
                </p>
              )}
            </div>
          </div>

          {/* Actions */}
          {isAdmin && (
            <div className="flex items-center gap-1.5 pt-1">
              <Button
                variant="outline"
                size="sm"
                className="h-8 gap-1.5 text-xs font-medium"
                disabled={isFetching}
                onClick={handleFetch}
              >
                {isFetching ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                {isFetching ? 'Syncing...' : 'Sync'}
              </Button>
              <Button
                variant="ghost"
                size="sm"
                className={cn(
                  'h-8 w-8 p-0',
                  deletingTarget ? 'text-destructive bg-destructive/10' : 'text-muted-foreground hover:text-destructive',
                )}
                onClick={handleDelete}
                title={deletingTarget ? 'Click again to confirm' : 'Remove'}
              >
                <Trash2 className="h-3.5 w-3.5" />
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Posts feed */}
      <div className="flex-1 overflow-y-auto">
        {isLoading ? (
          <div className="p-6 space-y-6">
            {[1, 2, 3].map((i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-4 w-2/3" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-4/5" />
                <Skeleton className="h-3 w-1/4 mt-2" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <div className="flex items-center justify-center py-20">
            <div className="text-center">
              <MessageSquare className="h-8 w-8 mx-auto text-muted-foreground/15 mb-3" />
              <p className="text-sm font-medium text-muted-foreground">No posts yet</p>
              <p className="text-xs text-muted-foreground/60 mt-1 mb-3">
                Click Sync to pull their latest LinkedIn activity
              </p>
              {isAdmin && (
                <Button size="sm" variant="outline" onClick={handleFetch} disabled={isFetching} className="gap-1.5">
                  {isFetching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                  Sync Now
                </Button>
              )}
            </div>
          </div>
        ) : (
          <div className="divide-y">
            {posts.map((post: EngagementPost) => {
              const tier = engagementTier(post);
              const isCommenting = commentingPostId === post.id;

              return (
                <div
                  key={post.id}
                  className={cn(
                    'px-6 py-5 transition-colors',
                    post.is_commented && 'bg-emerald-50/40',
                    isCommenting && 'bg-primary/[0.03]',
                  )}
                >
                  {/* Status tags */}
                  {(tier === 'hot' || post.is_commented) && (
                    <div className="flex items-center gap-2 mb-3">
                      {tier === 'hot' && (
                        <Badge variant="secondary" className="bg-primary/10 text-primary border-0 text-[10px] font-semibold gap-1 px-2">
                          <TrendingUp className="h-3 w-3" />
                          Trending
                        </Badge>
                      )}
                      {post.is_commented && (
                        <Badge variant="secondary" className="bg-emerald-100 text-emerald-700 border-0 text-[10px] font-semibold gap-1 px-2">
                          <CheckCircle2 className="h-3 w-3" />
                          Commented
                        </Badge>
                      )}
                    </div>
                  )}

                  {/* Post content — full, no clamp */}
                  {post.content ? (
                    <p className="text-[14px] leading-[1.7] whitespace-pre-wrap text-foreground/85">
                      {post.content}
                    </p>
                  ) : (
                    <p className="text-sm text-muted-foreground italic">
                      Media post (image/video/document)
                    </p>
                  )}

                  {/* Engagement metrics + actions */}
                  <div className="flex items-center justify-between mt-4">
                    <div className="flex items-center gap-4">
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
                      <span className="text-[11px] text-muted-foreground/50">
                        {timeAgo(post.published_at)}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {isAdmin && (
                        <Button
                          variant={isCommenting ? 'default' : 'ghost'}
                          size="sm"
                          className="h-7 gap-1 text-xs"
                          onClick={() => setCommentingPostId(isCommenting ? null : post.id)}
                        >
                          <MessageCircle className="h-3.5 w-3.5" />
                          {post.is_commented ? 'Reply again' : 'Comment'}
                        </Button>
                      )}
                      <a
                        href={post.linkedin_post_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-7 w-7 flex items-center justify-center rounded-md text-muted-foreground/50 hover:text-primary hover:bg-primary/10 transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    </div>
                  </div>

                  {/* Comment composer */}
                  {isCommenting && (
                    <div className="mt-4 animate-in slide-in-from-top-2 fade-in duration-200">
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
