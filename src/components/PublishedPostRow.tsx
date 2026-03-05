import { Post, ReactionBreakdown } from '@/types/post';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { getRelativeTime } from '@/lib/timeUtils';
import { cn } from '@/lib/utils';
import { ExternalLink, Eye, Heart, MessageCircle, Repeat2, Users, TrendingUp } from 'lucide-react';
import { PostEngagersPanel } from '@/components/PostEngagersPanel';
import { useState } from 'react';

const reactionEmojis: Record<keyof ReactionBreakdown, string> = {
  like: '👍', celebrate: '👏', support: '💚', love: '❤️', insightful: '💡', curious: '🤔',
};

function getTopReactions(breakdown?: ReactionBreakdown | null): string[] {
  if (!breakdown) return ['👍'];
  return Object.entries(breakdown)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => reactionEmojis[type as keyof ReactionBreakdown]);
}

interface PublishedPostRowProps {
  post: Post;
  publisherHeadline?: string | null;
  publisherCompany?: string | null;
  isEven?: boolean;
}

export function PublishedPostRow({ post, publisherHeadline, isEven }: PublishedPostRowProps) {
  const [isExpanded, setIsExpanded] = useState(false);

  const totalReactions = post.reactions || 0;
  const comments = post.comments_count || 0;
  const reshares = post.reshares || 0;
  const impressions = post.impressions || 0;
  const reach = post.unique_impressions || 0;
  const engagementRate = post.engagement_rate || 0;
  const publishedDate = post.publishedAt || post.scheduledDate;
  const linkedInUrl = post.linkedinPostUrl || post.linkedinUrl;
  const topReactions = getTopReactions(post.reactionBreakdown);
  const displaySubtitle = publisherHeadline || post.publisherRole;

  const contentPreview = post.content.length > 120
    ? post.content.substring(0, 120) + '…'
    : post.content;

  return (
    <div className="group bg-card/50 border border-border/40 rounded-lg hover:border-border hover:bg-card transition-all duration-150">
      <div className="flex items-start gap-3 p-3">
        {/* Avatar */}
        <PublisherAvatar
          name={post.publisherName}
          size="sm"
          className="w-7 h-7 ring-1 ring-border flex-shrink-0 mt-0.5"
        />

        {/* Content Column */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 mb-0.5">
            <span className="text-xs font-semibold text-foreground truncate">{post.publisherName}</span>
            <span className="text-[10px] text-muted-foreground">·</span>
            <span className="text-[10px] text-muted-foreground">{publishedDate ? getRelativeTime(publishedDate) : ''}</span>
            {linkedInUrl && (
              <a href={linkedInUrl} target="_blank" rel="noopener noreferrer" className="ml-auto opacity-0 group-hover:opacity-100 transition-opacity">
                <ExternalLink className="h-3 w-3 text-muted-foreground hover:text-foreground" />
              </a>
            )}
          </div>
          
          <p
            className={cn(
              "text-xs text-muted-foreground leading-relaxed",
              !isExpanded && "line-clamp-2"
            )}
          >
            {isExpanded ? post.content : contentPreview}
          </p>
          {post.content.length > 120 && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="text-[10px] text-primary hover:text-primary/80 font-medium mt-0.5"
            >
              {isExpanded ? 'less' : 'more'}
            </button>
          )}

          {/* Metrics Row */}
          <div className="flex items-center gap-3 mt-2 flex-wrap">
            {impressions > 0 && (
              <MetricPill icon={Eye} value={impressions.toLocaleString()} />
            )}
            {reach > 0 && (
              <MetricPill icon={Users} value={reach.toLocaleString()} />
            )}
            {totalReactions > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <span className="flex -space-x-0.5">
                  {topReactions.map((e, i) => <span key={i} className="text-[10px]">{e}</span>)}
                </span>
                <span className="font-mono tabular-nums font-medium text-foreground">{totalReactions.toLocaleString()}</span>
              </span>
            )}
            {comments > 0 && (
              <MetricPill icon={MessageCircle} value={comments.toLocaleString()} />
            )}
            {reshares > 0 && (
              <MetricPill icon={Repeat2} value={reshares.toLocaleString()} />
            )}
            {engagementRate > 0 && (
              <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
                <TrendingUp className="h-2.5 w-2.5" />
                <span className="font-mono tabular-nums font-medium text-foreground">{engagementRate.toFixed(1)}%</span>
              </span>
            )}
          </div>
        </div>

        {/* Thumbnail */}
        {post.mediaUrl && (
          <img
            src={post.mediaUrl}
            alt=""
            className="w-14 h-14 rounded-md object-cover flex-shrink-0 border border-border/40"
            loading="lazy"
          />
        )}
      </div>

      <PostEngagersPanel
        postId={post.id}
        totalReactions={totalReactions}
        totalComments={comments}
      />
    </div>
  );
}

function MetricPill({ icon: Icon, value }: { icon: typeof Eye; value: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-[10px] text-muted-foreground">
      <Icon className="h-2.5 w-2.5" />
      <span className="font-mono tabular-nums font-medium text-foreground">{value}</span>
    </span>
  );
}
