import { useState } from 'react';
import { useTargetComments, DiscoveredComment } from '@/hooks/useEngagementActivity';
import { useLikeComment } from '@/hooks/useEngagement';
import { Skeleton } from '@/components/ui/skeleton';
import { Button } from '@/components/ui/button';
import { ExternalLink, MessageCircle, ThumbsUp, RefreshCw, Loader2, Quote, Sparkles, Check } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props {
  targetId: string;
  targetName: string;
  publisherId: string;
  isAdmin: boolean;
  isFetching: boolean;
  onFetch: () => void;
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

export function TargetCommentsFeed({ targetId, targetName, publisherId, isAdmin, isFetching, onFetch }: Props) {
  const { data: comments = [], isLoading } = useTargetComments(targetId);

  if (isLoading) {
    return (
      <div className="max-w-[820px] mx-auto px-4 py-3">
        <div className="border border-border bg-white rounded-sm divide-y divide-border">
          {[1, 2, 3].map((i) => (
            <div key={i} className="px-4 py-4 space-y-2">
              <Skeleton className="h-2.5 w-1/3" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-11/12" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (comments.length === 0) {
    return (
      <div className="flex items-center justify-center py-16">
        <div className="text-center max-w-sm px-6">
          <div className="h-10 w-10 mx-auto rounded-sm bg-muted border border-border flex items-center justify-center mb-3">
            <Sparkles className="h-4 w-4 text-muted-foreground" />
          </div>
          <p className="font-semibold text-[13px] text-foreground">No comments captured yet</p>
          <p className="text-[12px] text-muted-foreground mt-0.5 mb-3">
            Pull the latest comments <span className="text-foreground/80 font-medium">{targetName}</span> left on other people's posts. Each one is a post you might want to jump into.
          </p>
          {isAdmin && (
            <Button
              size="sm"
              onClick={onFetch}
              disabled={isFetching}
              className="h-7 gap-1.5 bg-[#4f46e5] hover:bg-[#4338ca] text-white border-0 text-[11px] rounded-sm"
            >
              {isFetching ? <Loader2 className="h-3 w-3 animate-spin" /> : <RefreshCw className="h-3 w-3" />}
              Sync comments
            </Button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-[820px] mx-auto px-4 py-3">
      <div className="border border-border bg-white rounded-sm">
        <div className="grid grid-cols-[1fr_auto] items-center gap-3 px-3 h-7 border-b border-border bg-[#f6f7f9] text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
          <span>Post they engaged with · their comment</span>
          <span className="tabular-nums">Reactions</span>
        </div>
        <ul className="divide-y-[6px] divide-[#eef0f3]">
          {comments.map((c) => (
            <CommentRow key={c.id} comment={c} targetName={targetName} publisherId={publisherId} />
          ))}
        </ul>
      </div>
    </div>
  );
}

function CommentRow({ comment, targetName, publisherId }: { comment: DiscoveredComment; targetName: string; publisherId: string }) {
  const [expanded, setExpanded] = useState(false);
  const likeComment = useLikeComment();
  const parentUrl = comment.parent_post_url || comment.comment_url;
  const parentAuthor = comment.parent_post_author_name || 'LinkedIn member';
  const parentContent = comment.parent_post_content;
  const parentHeadline = comment.parent_post_author_headline;
  const longContent = (parentContent?.length || 0) > 220;
  const isLiked = !!comment.comment_metadata?.is_liked;
  const canLike = !!comment.comment_urn || (comment.comment_url?.includes('urn:li:comment:') ?? false);

  return (
    <li className="relative px-4 py-4 hover:bg-[#fafbfc] transition-colors">
      {/* meta row — parent post attribution */}
      <div className="flex items-center gap-2 text-[10.5px] font-mono uppercase tracking-wider text-muted-foreground mb-1.5">
        <span className="text-foreground/80 normal-case tracking-normal font-sans font-semibold text-[12px]">
          {parentAuthor}
        </span>
        {parentHeadline && (
          <span className="text-muted-foreground/70 normal-case tracking-normal font-sans text-[11px] truncate max-w-[280px]">
            · {parentHeadline}
          </span>
        )}
        {comment.commented_at && (
          <span
            className="ml-auto normal-case tracking-normal font-sans text-[11px]"
            title={`Commented ${new Date(comment.commented_at).toLocaleString()}`}
          >
            {timeAgo(comment.commented_at)}
          </span>
        )}
      </div>

      {/* parent post content */}
      {parentContent ? (
        <div>
          <p
            className={cn(
              'text-[13px] leading-[1.5] text-foreground/90 whitespace-pre-wrap',
              !expanded && 'line-clamp-3',
            )}
          >
            {parentContent}
          </p>
          {longContent && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="mt-0.5 text-[11px] text-[#4f46e5] hover:underline font-medium"
            >
              {expanded ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>
      ) : (
        <p className="text-[12px] text-muted-foreground italic">Post content unavailable</p>
      )}

      {/* target's comment quote */}
      {comment.comment_text && (
        <div className="mt-2.5 flex gap-2 items-start rounded-sm bg-amber-50/60 border-l-2 border-amber-300 px-2.5 py-2">
          <Quote className="h-3 w-3 text-amber-600/70 mt-0.5 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-[10.5px] font-mono uppercase tracking-wider text-amber-700/80 mb-0.5">
              {targetName} commented
            </p>
            <p className="text-[12.5px] leading-[1.5] text-foreground/90 whitespace-pre-wrap">
              {comment.comment_text}
            </p>
          </div>
          {comment.reactions_count > 0 && (
            <span className="inline-flex items-center gap-1 text-[11px] tabular-nums text-muted-foreground flex-shrink-0">
              <ThumbsUp className="h-3 w-3" />
              {comment.reactions_count}
            </span>
          )}
        </div>
      )}

      {/* actions */}
      <div className="flex items-center gap-1.5 mt-2.5">
        {parentUrl && (
          <a
            href={parentUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              'inline-flex items-center gap-1 h-6 px-2.5 rounded-sm text-[11px] font-semibold border transition-colors',
              'bg-[#4f46e5] text-white border-[#4f46e5] hover:bg-[#4338ca] hover:border-[#4338ca]',
            )}
          >
            <MessageCircle className="h-3 w-3" />
            Engage on this post
          </a>
        )}
        <button
          type="button"
          disabled={!canLike || isLiked || likeComment.isPending}
          onClick={() => likeComment.mutate({ publisher_id: publisherId, comment_id: comment.id })}
          title={
            !canLike
              ? 'No comment URN captured yet — re-sync comments to enable liking'
              : isLiked
              ? 'You already liked this comment'
              : `Like ${targetName}'s comment on LinkedIn`
          }
          className={cn(
            'inline-flex items-center gap-1 h-6 px-2 rounded-sm text-[11px] font-medium border transition-colors',
            isLiked
              ? 'bg-emerald-50 text-emerald-700 border-emerald-200 cursor-default'
              : 'bg-white text-foreground/70 border-border hover:bg-muted',
            (!canLike || likeComment.isPending) && 'opacity-50 cursor-not-allowed',
          )}
        >
          {likeComment.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isLiked ? (
            <Check className="h-3 w-3" />
          ) : (
            <ThumbsUp className="h-3 w-3" />
          )}
          {isLiked ? 'Liked' : 'Like comment'}
        </button>
        {comment.parent_post_author_url && (
          <a
            href={comment.parent_post_author_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 h-6 px-2 rounded-sm text-[11px] font-medium border border-border bg-white text-foreground/70 hover:bg-muted transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View author
          </a>
        )}
      </div>
    </li>
  );
}
