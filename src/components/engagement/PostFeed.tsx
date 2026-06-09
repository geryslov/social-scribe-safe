import { useState } from 'react';
import { useEngagementPosts, EngagementPost } from '@/hooks/useEngagement';
import { Publisher } from '@/hooks/usePublishers';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, ThumbsUp, MessageSquare, Share2, MessageCircle } from 'lucide-react';
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

export function PostFeed({ targetId, publisher, isAdmin }: PostFeedProps) {
  const { posts, isLoading } = useEngagementPosts(targetId);
  const [commentingPostId, setCommentingPostId] = useState<string | null>(null);

  if (isLoading) {
    return <div className="text-sm text-muted-foreground py-4">Loading posts...</div>;
  }

  if (posts.length === 0) {
    return (
      <div className="text-sm text-muted-foreground py-4">
        No posts fetched yet. Click "Fetch Posts" to pull their recent LinkedIn activity.
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {posts.map((post: EngagementPost) => (
        <div key={post.id}>
          <Card className="p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="flex-1 min-w-0">
                {post.content && (
                  <p className="text-sm line-clamp-3 whitespace-pre-wrap">{post.content}</p>
                )}
                {!post.content && (
                  <p className="text-sm text-muted-foreground italic">No text content (may be image/video)</p>
                )}

                <div className="flex items-center gap-3 mt-2 text-[11px] text-muted-foreground">
                  {post.likes_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <ThumbsUp className="h-3 w-3" />
                      {post.likes_count.toLocaleString()}
                    </span>
                  )}
                  {post.comments_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <MessageSquare className="h-3 w-3" />
                      {post.comments_count.toLocaleString()}
                    </span>
                  )}
                  {post.shares_count > 0 && (
                    <span className="flex items-center gap-0.5">
                      <Share2 className="h-3 w-3" />
                      {post.shares_count.toLocaleString()}
                    </span>
                  )}
                  <span>{timeAgo(post.published_at)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 flex-shrink-0">
                {isAdmin && (
                  <Button
                    variant={commentingPostId === post.id ? 'secondary' : 'ghost'}
                    size="sm"
                    className="h-7 gap-1 text-xs"
                    onClick={() => setCommentingPostId(commentingPostId === post.id ? null : post.id)}
                  >
                    <MessageCircle className="h-3 w-3" />
                    Comment
                  </Button>
                )}
                <a
                  href={post.linkedin_post_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="h-7 w-7 flex items-center justify-center rounded-md hover:bg-muted transition-colors"
                >
                  <ExternalLink className="h-3 w-3 text-muted-foreground" />
                </a>
              </div>
            </div>
          </Card>

          {/* Comment composer */}
          {commentingPostId === post.id && (
            <div className="ml-4 mt-1">
              <CommentComposer
                post={post}
                publisher={publisher}
                onClose={() => setCommentingPostId(null)}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
