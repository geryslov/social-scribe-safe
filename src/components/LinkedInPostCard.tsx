import { useState } from 'react';
import { ThumbsUp, MessageCircle, Repeat2, Send, ExternalLink, Eye, Users, TrendingUp, Linkedin } from 'lucide-react';
import { Post, ReactionBreakdown } from '@/types/post';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { CountUp } from '@/components/CountUp';
import { getRelativeTime } from '@/lib/timeUtils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LinkedInPublishModal } from '@/components/LinkedInPublishModal';
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
  const { publishers } = usePublishers();
  
  // Find the publisher for this post
  const publisher = publishers.find(p => p.name === post.publisherName);
  const isPublisherConnected = publisher?.linkedin_connected ?? false;
  
  const maxLength = variant === 'feed' ? 280 : 500;
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

  return (
    <div className={cn(
      "bg-card border border-border rounded-lg overflow-hidden transition-all duration-200",
      "hover:border-primary/30 hover:shadow-lg hover:shadow-primary/5",
      className
    )}>
      {/* Post Header */}
      <div className="p-4 pb-2">
        <div className="flex items-start gap-3">
          <PublisherAvatar 
            name={post.publisherName} 
            size="md" 
            className="w-12 h-12 ring-2 ring-border"
          />
          
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-semibold text-foreground leading-tight">
                  {post.publisherName}
                </h3>
                {displaySubtitle && (
                  <p className="text-sm text-muted-foreground line-clamp-1">
                    {displaySubtitle}
                  </p>
                )}
                {publisherCompany && !displaySubtitle?.toLowerCase().includes(publisherCompany.toLowerCase()) && (
                  <p className="text-xs text-muted-foreground/70 line-clamp-1 flex items-center gap-1">
                    <span className="w-1 h-1 rounded-full bg-muted-foreground/50" />
                    {publisherCompany}
                  </p>
                )}
              </div>
              <div className="flex items-center gap-2 text-muted-foreground">
                <span className="text-xs">
                  {publishedDate ? getRelativeTime(publishedDate) : 'Draft'}
                </span>
                <Linkedin className="h-4 w-4 text-[#0A66C2]" />
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Post Content */}
      <div className="px-4 pb-3">
        <p className="text-foreground whitespace-pre-wrap leading-relaxed">
          {displayContent}
          {shouldTruncate && !isExpanded && '...'}
        </p>
        {shouldTruncate && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="text-muted-foreground hover:text-primary text-sm font-medium mt-1"
          >
            {isExpanded ? 'show less' : '...more'}
          </button>
        )}
      </div>

      {/* Engagement Summary */}
      {(totalReactions > 0 || comments > 0 || reshares > 0) && (
        <div className="px-4 py-2 border-t border-border/50">
          <div className="flex items-center justify-between text-sm text-muted-foreground">
            <div className="flex items-center gap-1">
              {/* Reaction icons stack */}
              <div className="flex -space-x-1">
                {topReactions.map((emoji, idx) => (
                  <span 
                    key={idx} 
                    className="text-base bg-background rounded-full p-0.5 border border-border/50"
                    style={{ zIndex: 3 - idx }}
                  >
                    {emoji}
                  </span>
                ))}
              </div>
              <span className="ml-1">{totalReactions.toLocaleString()}</span>
            </div>
            
            <div className="flex items-center gap-3">
              {comments > 0 && (
                <span>{comments} comment{comments !== 1 ? 's' : ''}</span>
              )}
              {reshares > 0 && (
                <span>{reshares} repost{reshares !== 1 ? 's' : ''}</span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div className="px-2 py-1 border-t border-border/50">
        <div className="flex items-center justify-around">
          <ActionButton icon={ThumbsUp} label="Like" />
          <ActionButton icon={MessageCircle} label="Comment" />
          <ActionButton icon={Repeat2} label="Repost" />
          <ActionButton icon={Send} label="Send" />
          {post.status !== 'done' && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 hover:bg-[#0077b5]/10 hover:text-[#0077b5] text-xs gap-1.5"
              onClick={() => setShowLinkedInModal(true)}
            >
              <Linkedin className="h-4 w-4" />
              Push
            </Button>
          )}
        </div>
      </div>

      {/* Analytics Panel */}
      {showAnalytics && impressions > 0 && (
        <div className="px-4 py-3 bg-muted/30 border-t border-border">
          <div className="flex items-center gap-2 mb-3 text-xs font-mono text-muted-foreground uppercase tracking-wider">
            <TrendingUp className="h-3 w-3" />
            Analytics
          </div>
          
          <div className="grid grid-cols-4 gap-2">
            <AnalyticsStat
              icon={Eye}
              value={impressions}
              label="Impressions"
            />
            <AnalyticsStat
              icon={Users}
              value={reach}
              label="Reach"
            />
            <AnalyticsStat
              icon={TrendingUp}
              value={engagementRate}
              label="Engagement"
              isPercentage
            />
            {linkedInUrl && (
              <a
                href={linkedInUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="flex flex-col items-center justify-center p-2 rounded-lg bg-primary/10 hover:bg-primary/20 transition-colors group"
              >
                <ExternalLink className="h-4 w-4 text-primary group-hover:scale-110 transition-transform" />
                <span className="text-[10px] text-muted-foreground mt-1">View</span>
              </a>
            )}
          </div>
        </div>
      )}

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
    <button className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:bg-muted/50 hover:text-foreground transition-colors">
      <Icon className="h-4 w-4" />
      <span className="text-sm font-medium hidden sm:inline">{label}</span>
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
    <div className="flex flex-col items-center p-2 rounded-lg bg-background/50">
      <Icon className="h-4 w-4 text-muted-foreground mb-1" />
      <span className="text-sm font-bold font-mono tabular-nums">
        <CountUp 
          end={value} 
          decimals={isPercentage ? 1 : 0}
          suffix={isPercentage ? '%' : ''}
        />
      </span>
      <span className="text-[10px] text-muted-foreground">{label}</span>
    </div>
  );
}
