import { useState } from 'react';
import { ThumbsUp, MessageCircle, Repeat2, Send, ExternalLink, Eye, Users, TrendingUp, Linkedin, ChevronRight } from 'lucide-react';
import { Post, ReactionBreakdown } from '@/types/post';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { CountUp } from '@/components/CountUp';
import { getRelativeTime } from '@/lib/timeUtils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LinkedInPublishModal } from '@/components/LinkedInPublishModal';
import { PostEngagersPanel } from '@/components/PostEngagersPanel';
import { usePublishers } from '@/hooks/usePublishers';
import { toast } from 'sonner';

interface LinkedInPostCardProps {
  post: Post;
  showAnalytics?: boolean;
  variant?: 'feed' | 'detail';
  className?: string;
  publisherHeadline?: string | null;
  publisherCompany?: string | null;
}

// Reaction type to emoji mapping
const reactionEmojis: Record<keyof ReactionBreakdown, string> = {
  like: '👍',
  celebrate: '👏',
  support: '💚',
  love: '❤️',
  insightful: '💡',
  curious: '🤔',
};

// Get top 3 reaction types based on counts
function getTopReactions(breakdown?: ReactionBreakdown | null): string[] {
  if (!breakdown) return ['👍'];
  
  return Object.entries(breakdown)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => reactionEmojis[type as keyof ReactionBreakdown]);
}

export function LinkedInPostCard({ 
  post, 
  showAnalytics = true, 
  variant = 'feed',
  className,
  publisherHeadline,
  publisherCompany,
}: LinkedInPostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [showReactionBreakdown, setShowReactionBreakdown] = useState(false);
  const { publishers } = usePublishers();
  
  // Find the publisher for this post
  const publisher = publishers.find(p => p.name === post.publisherName);
  const isPublisherConnected = publisher?.linkedin_connected ?? false;
  
  const maxLength = variant === 'feed' ? 200 : 400;
  const shouldTruncate = post.content.length > maxLength;
  const displayContent = isExpanded || !shouldTruncate 
    ? post.content 
    : post.content.substring(0, maxLength);

  const topReactions = getTopReactions(post.reactionBreakdown);
  const totalReactions = post.reactions || 0;
  const comments = post.comments_count || 0;
  const reshares = post.reshares || 0;
  const impressions = post.impressions || 0;
  const reach = post.unique_impressions || 0;
  const engagementRate = post.engagement_rate || 0;
  
  const publishedDate = post.publishedAt || post.scheduledDate;
  const linkedInUrl = post.linkedinPostUrl || post.linkedinUrl;
  
  // Use publisher headline if available, otherwise fall back to role
  const displaySubtitle = publisherHeadline || post.publisherRole;

  // Build reaction breakdown entries
  const breakdownEntries = post.reactionBreakdown
    ? Object.entries(post.reactionBreakdown)
        .filter(([_, count]) => count > 0)
        .sort((a, b) => b[1] - a[1])
    : [];

  return (
    <div className={cn(
      "bg-card border border-border rounded-lg overflow-hidden transition-all duration-200",
      "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
      className
    )}>
      {/* Post Header - Compact */}
      <div className="px-3 pt-3 pb-1.5">
        <div className="flex items-center gap-2.5">
          <PublisherAvatar 
            name={post.publisherName} 
            size="sm" 
            className="w-9 h-9 ring-1 ring-border"
          />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-sm font-semibold text-foreground leading-tight truncate">
                  {post.publisherName}
                </h3>
                {displaySubtitle && (
                  <p className="text-[11px] text-muted-foreground line-clamp-1 leading-tight">
                    {displaySubtitle}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-1.5 text-muted-foreground flex-shrink-0 ml-2">
                <span className="text-[10px]">
                  {publishedDate ? getRelativeTime(publishedDate) : 'Draft'}
                </span>
                <Linkedin className="h-3.5 w-3.5 text-[#0A66C2]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Post Content - Compact */}
      <div className="px-3 pb-2">
        <p className="text-sm text-foreground whitespace-pre-wrap leading-snug">
          {displayContent}
          {shouldTruncate && !isExpanded && '...'}
        </p>
        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-primary text-xs font-medium mt-0.5"
          >
            {isExpanded ? 'show less' : '...more'}
          </button>
        )}
      </div>

      {/* Engagement Summary - Clickable reactions */}
      {(totalReactions > 0 || comments > 0 || reshares > 0) && (
        <div className="px-3 py-1.5 border-t border-border/50">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <button
              onClick={() => setShowReactionBreakdown(!showReactionBreakdown)}
              className="flex items-center gap-1 hover:text-foreground transition-colors group"
            >
              <div className="flex -space-x-1">
                {topReactions.map((emoji, idx) => (
                  <span 
                    key={idx} 
                    className="text-sm bg-background rounded-full p-px border border-border/50"
                    style={{ zIndex: 3 - idx }}
                  >
                    {emoji}
                  </span>
                ))}
              </div>
              <span className="ml-0.5 font-medium">{totalReactions.toLocaleString()}</span>
              <ChevronRight className={cn(
                "h-3 w-3 transition-transform duration-200",
                showReactionBreakdown && "rotate-90"
              )} />
            </button>
            
            <div className="flex items-center gap-2.5">
              {comments > 0 && (
                <span>{comments} comment{comments !== 1 ? 's' : ''}</span>
              )}
              {reshares > 0 && (
                <span>{reshares} repost{reshares !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>

          {/* Reaction Breakdown Slide-in */}
          {showReactionBreakdown && breakdownEntries.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5 animate-fade-in pb-1">
              {breakdownEntries.map(([type, count]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-muted/50 border border-border/50 text-[11px] font-medium"
                >
                  <span className="text-sm">{reactionEmojis[type as keyof ReactionBreakdown] || '👍'}</span>
                  <span className="capitalize text-foreground">{type}</span>
                  <span className="text-muted-foreground font-mono">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Buttons - Compact */}
      <div className="px-1 py-0.5 border-t border-border/50">
        <div className="flex items-center justify-around">
          <ActionButton icon={ThumbsUp} label="Like" />
          <ActionButton icon={MessageCircle} label="Comment" />
          <ActionButton icon={Repeat2} label="Repost" />
          <ActionButton icon={Send} label="Send" />
          {post.status !== 'done' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 hover:bg-[#0077b5]/10 hover:text-[#0077b5] text-xs gap-1"
              onClick={() => setShowLinkedInModal(true)}
            >
              <Linkedin className="h-3.5 w-3.5" />
              Push
            </Button>
          )}
        </div>
      </div>

      {/* Analytics Panel - Compact */}
      {showAnalytics && impressions > 0 && (
        <div className="px-3 py-2 bg-muted/30 border-t border-border">
          <div className="grid grid-cols-4 gap-1.5">
            <AnalyticsStat icon={Eye} value={impressions} label="Impressions" />
            <AnalyticsStat icon={Users} value={reach} label="Reach" />
            <AnalyticsStat icon={TrendingUp} value={engagementRate} label="Engage" isPercentage />
            {linkedInUrl && (
              <a
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors group"
              >
                <ExternalLink className="h-3.5 w-3.5 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-[9px] text-muted-foreground mt-0.5">View</span>
              </a>
            )}
          </div>
        </div>
      )}

      {/* Who Engaged Panel */}
      <PostEngagersPanel
        postId={post.id}
        totalReactions={totalReactions}
        totalComments={comments}
      />

      {/* LinkedIn Publish Modal */}
      <LinkedInPublishModal
        isOpen={showLinkedInModal}
        onClose={() => setShowLinkedInModal(false)}
        post={post}
        publisherId={publisher?.id ?? null}
        isPublisherConnected={isPublisherConnected}
        onPublishSuccess={() => {
          setShowLinkedInModal(false);
          toast.success('Published to LinkedIn!');
        }}
        onConnectLinkedIn={() => {
          toast.info('Edit the publisher to connect LinkedIn');
        }}
      />
    </div>
  );
}

function ActionButton({ icon: Icon, label }: { icon: typeof ThumbsUp; label: string }) {
  return (
    <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
      <Icon className="h-3.5 w-3.5" />
      <span className="text-xs font-medium hidden sm:inline">{label}</span>
    </button>
  );
}

function AnalyticsStat({ 
  icon: Icon, 
  value, 
  label, 
  isPercentage = false 
}: { 
  icon: typeof Eye; 
  value: number; 
  label: string;
  isPercentage?: boolean;
}) {
  return (
    <div className="flex flex-col items-center p-1.5 rounded-lg bg-background/50">
      <Icon className="h-3.5 w-3.5 text-muted-foreground mb-0.5" />
      <span className="text-xs font-bold font-mono tabular-nums">
        <CountUp 
          end={value} 
          decimals={isPercentage ? 1 : 0}
          suffix={isPercentage ? '%' : ''}
        />
      </span>
      <span className="text-[9px] text-muted-foreground">{label}</span>
    </div>
  );
}
