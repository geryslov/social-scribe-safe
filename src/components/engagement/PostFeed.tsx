import { useState } from 'react';
import { useEngagementPosts, EngagementPost } from '@/hooks/useEngagement';
import { Publisher } from '@/hooks/usePublishers';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { ExternalLink, ThumbsUp, MessageSquare, Share2, MessageCircle, TrendingUp } from 'lucide-react';
import { cn } from '@/lib/utils';
import { CommentComposer } from './CommentComposer';

interface PostFeedProps {
  targetId: string;
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

/** Determine engagement tier for visual weight */
function engagementTier(post: EngagementPost): 'hot' | 'warm' | 'normal' {
  const total = post.likes_count + post.comments_count * 3 + post.shares_count * 5;
  if (total >= 200) return 'hot';
  if (total >= 50) return 'warm';
  return 'normal';
}

export function PostFeed({ targetId, publisher, isAdmin }: PostFeedProps) {
  const { posts, isLoading } = useEngagementPosts(targetId);
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);

  if (isLoading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="p-4">
            <Skeleton className="h-4 w-3/4 mb-2" />
            <Skeleton className="h-4 w-full mb-2" />
            <Skeleton className="h-3 w-1/3" />
          </Card>
        ))}
      </div>
    );
  }

  if (posts.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-border rounded-lg">
        <MessageSquare className="h-6 w-6 mx-auto text-muted-foreground/40 mb-2" />
        <p className="text-sm text-muted-foreground">
          No posts fetched yet. Click <span className="font-medium text-foreground">Fetch Posts</span> above.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {posts.map((post: EngagementPost) => {
        const tier = engagementTier(post);
        const isCommenting = commentingPostId === post.id;

        return (
          <div key={post.id}>
            <Card
              className={cn(
                'p-4 transition-all duration-200 hover:shadow-md group',
                tier === 'hot' && 'border-l-[3px] border-l-primary bg-primary/[0.02]',
                tier === 'warm' && 'border-l-[3px] border-l-primary/40',
                isCommenting && 'ring-1 ring-primary/20',
              )}
            >
              {/* Hot post indicator */}
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

                  {/* Metrics row */}
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

                {/* Actions */}
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

            {/* Comment composer — slides in */}
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
  );
}
