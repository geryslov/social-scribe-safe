import { useState, useRef } from 'react';
import { ExternalLink, Eye, Users, TrendingUp, Linkedin, ChevronRight, Pencil, ImagePlus, X, Loader2, Trash2 } from 'lucide-react';
import { Post, ReactionBreakdown } from '@/types/post';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { CountUp } from '@/components/CountUp';
import { getRelativeTime } from '@/lib/timeUtils';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { LinkedInPublishModal } from '@/components/LinkedInPublishModal';
import { PostEngagersPanel } from '@/components/PostEngagersPanel';
import { usePublishers } from '@/hooks/usePublishers';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface LinkedInPostCardProps {
  post: Post;
  showAnalytics?: boolean;
  variant?: 'feed' | 'detail';
  className?: string;
  publisherHeadline?: string | null;
  publisherCompany?: string | null;
  onEdit?: (post: Post) => void;
  onMediaUpdate?: (postId: string, mediaUrl: string | null) => void;
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
  onEdit,
  onMediaUpdate,
}: LinkedInPostCardProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [showReactionBreakdown, setShowReactionBreakdown] = useState(false);
  const [isUploadingMedia, setIsUploadingMedia] = useState(false);
  const mediaInputRef = useRef<HTMLInputElement>(null);
  const { publishers } = usePublishers();
  const { currentWorkspace } = useWorkspace();
  
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

  const isEditable = post.status !== 'done';

  const handleInlineMediaUpload = async (file: File) => {
    const acceptedTypes = ['image/jpeg', 'image/png', 'image/gif'];
    if (!acceptedTypes.includes(file.type)) {
      toast.error('Use JPEG, PNG, or GIF images.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image too large. Max 5MB.');
      return;
    }
    if (!currentWorkspace) {
      toast.error('No workspace selected');
      return;
    }

    setIsUploadingMedia(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${currentWorkspace.id}/${post.id}/${Date.now()}.${ext}`;
      const { error: uploadError } = await supabase.storage
        .from('post-media')
        .upload(path, file);
      if (uploadError) throw uploadError;

      const { data: publicUrlData } = supabase.storage
        .from('post-media')
        .getPublicUrl(path);
      const mediaUrl = publicUrlData.publicUrl;

      const { error: updateError } = await supabase
        .from('posts')
        .update({ media_url: mediaUrl })
        .eq('id', post.id);
      if (updateError) throw updateError;

      onMediaUpdate?.(post.id, mediaUrl);
      toast.success('Image attached!');
    } catch (err) {
      console.error(err);
      toast.error('Failed to upload image');
    } finally {
      setIsUploadingMedia(false);
    }
  };

  const handleRemoveMedia = async () => {
    try {
      const { error } = await supabase
        .from('posts')
        .update({ media_url: null })
        .eq('id', post.id);
      if (error) throw error;
      onMediaUpdate?.(post.id, null);
      toast.success('Image removed');
    } catch {
      toast.error('Failed to remove image');
    }
  };

  return (
    <div className={cn(
      "bg-card border border-border rounded-xl overflow-hidden transition-all duration-200",
      "hover:border-primary/20 hover:shadow-md",
      className
    )}>
      {/* Header Row */}
      <div className="flex items-center gap-2 px-3.5 pt-3 pb-1">
        <PublisherAvatar 
          name={post.publisherName} 
          size="sm" 
          className="w-8 h-8 ring-1 ring-border flex-shrink-0"
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="text-[13px] font-semibold text-foreground truncate">
              {post.publisherName}
            </span>
            <span className="text-[11px] text-muted-foreground">·</span>
            <span className="text-[11px] text-muted-foreground flex-shrink-0">
              {publishedDate ? getRelativeTime(publishedDate) : 'Draft'}
            </span>
          </div>
          {displaySubtitle && (
            <p className="text-[11px] text-muted-foreground truncate leading-tight">
              {displaySubtitle}
            </p>
          )}
        </div>
        <Linkedin className="h-3.5 w-3.5 text-[#0A66C2] flex-shrink-0" />
      </div>

      {/* Content + Media Row */}
      <div className={cn(
        "px-3.5 pb-2",
        post.mediaUrl && !post.postType?.includes('video') && "flex gap-3"
      )}>
        {/* Text Content */}
        <div className={cn("flex-1 min-w-0", post.mediaUrl && !post.postType?.includes('video') && "flex-[2]")}>
          <p className="text-[13px] text-foreground whitespace-pre-wrap leading-relaxed">
            {displayContent}
            {shouldTruncate && !isExpanded && (
              <button
                onClick={() => setIsExpanded(true)}
                className="text-primary hover:text-primary/80 text-[13px] font-medium ml-0.5"
              >
                ...more
              </button>
            )}
          </p>
          {isExpanded && shouldTruncate && (
            <button
              onClick={() => setIsExpanded(false)}
              className="text-muted-foreground hover:text-primary text-[11px] font-medium mt-0.5"
            >
              show less
            </button>
          )}
        </div>

        {/* Inline Image Thumbnail (beside text) */}
        {post.mediaUrl && !post.postType?.includes('video') && (
          <div className="relative flex-1 max-w-[140px] flex-shrink-0 group">
            <img
              src={post.mediaUrl}
              alt="Post attachment"
              className="w-full h-24 rounded-lg border border-border/50 object-cover"
              loading="lazy"
            />
            {isEditable && (
              <Button
                variant="secondary"
                size="sm"
                className="absolute top-1 right-1 h-5 w-5 p-0 opacity-0 group-hover:opacity-100 transition-opacity bg-background/80 backdrop-blur-sm"
                onClick={handleRemoveMedia}
              >
                <X className="h-3 w-3" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Video (full width below text) */}
      {post.mediaUrl && post.postType === 'video' && (
        <div className="px-3.5 pb-2">
          <div className="relative rounded-lg overflow-hidden bg-muted/50 border border-border/50 aspect-video">
            <video
              src={post.mediaUrl}
              className="w-full h-full object-cover"
              controls
              preload="metadata"
            />
          </div>
        </div>
      )}

      {/* Hidden file input */}
      <input
        ref={mediaInputRef}
        type="file"
        accept="image/jpeg,image/png,image/gif"
        className="hidden"
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleInlineMediaUpload(file);
          e.target.value = '';
        }}
      />

      {/* Image attach zone (for posts without media) */}
      {!post.mediaUrl && isEditable && (
        <div className="px-3.5 pb-2">
          <button
            onClick={() => mediaInputRef.current?.click()}
            disabled={isUploadingMedia}
            onDrop={(e) => {
              e.preventDefault();
              const file = e.dataTransfer.files?.[0];
              if (file) handleInlineMediaUpload(file);
            }}
            onDragOver={(e) => e.preventDefault()}
            className={cn(
              "w-full flex items-center justify-center gap-1.5 py-2 rounded-lg border border-dashed border-border/60 text-muted-foreground text-[11px]",
              "hover:border-primary/40 hover:text-primary hover:bg-primary/5 transition-colors cursor-pointer",
              isUploadingMedia && "opacity-50 cursor-wait"
            )}
          >
            {isUploadingMedia ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ImagePlus className="h-3.5 w-3.5" />
            )}
            {isUploadingMedia ? 'Uploading...' : 'Attach image'}
          </button>
        </div>
      )}

      {/* Engagement Row */}
      {(totalReactions > 0 || comments > 0 || reshares > 0) && (
        <div className="px-3.5 py-1 border-t border-border/40">
          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <button
              onClick={() => setShowReactionBreakdown(!showReactionBreakdown)}
              className="flex items-center gap-1 hover:text-foreground transition-colors"
            >
              <div className="flex -space-x-0.5">
                {topReactions.map((emoji, idx) => (
                  <span key={idx} className="text-xs" style={{ zIndex: 3 - idx }}>
                    {emoji}
                  </span>
                ))}
              </div>
              <span className="font-medium tabular-nums">{totalReactions.toLocaleString()}</span>
              <ChevronRight className={cn(
                "h-2.5 w-2.5 transition-transform duration-200",
                showReactionBreakdown && "rotate-90"
              )} />
            </button>
            <div className="flex items-center gap-2">
              {comments > 0 && <span>{comments} comment{comments !== 1 ? 's' : ''}</span>}
              {reshares > 0 && <span>{reshares} repost{reshares !== 1 ? 's' : ''}</span>}
            </div>
          </div>

          {showReactionBreakdown && breakdownEntries.length > 0 && (
            <div className="mt-1.5 flex flex-wrap gap-1 animate-fade-in pb-0.5">
              {breakdownEntries.map(([type, count]) => (
                <span
                  key={type}
                  className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-muted/40 text-[10px] font-medium"
                >
                  <span className="text-xs">{reactionEmojis[type as keyof ReactionBreakdown] || '👍'}</span>
                  <span className="capitalize text-foreground">{type}</span>
                  <span className="text-muted-foreground font-mono tabular-nums">{count}</span>
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Action Bar */}
      <div className="flex items-center border-t border-border/40 divide-x divide-border/40">
        {onEdit && post.status !== 'done' && (
          <button
            onClick={() => onEdit(post)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <Pencil className="h-3 w-3" />
            Edit
          </button>
        )}
        {post.status !== 'done' && (
          <button
            onClick={() => setShowLinkedInModal(true)}
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-[#0A66C2] hover:bg-[#0A66C2]/8 transition-colors"
          >
            <Linkedin className="h-3 w-3" />
            Push to LinkedIn
          </button>
        )}
        {linkedInUrl && (
          <a
            href={linkedInUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex-1 flex items-center justify-center gap-1.5 py-1.5 text-[11px] font-medium text-muted-foreground hover:text-foreground hover:bg-muted/40 transition-colors"
          >
            <ExternalLink className="h-3 w-3" />
            View
          </a>
        )}
      </div>

      {/* Analytics Strip */}
      {showAnalytics && impressions > 0 && (
        <div className="flex items-center justify-around px-3.5 py-1.5 bg-muted/20 border-t border-border/40 text-[10px]">
          <AnalyticsStat icon={Eye} value={impressions} label="Impressions" />
          <AnalyticsStat icon={Users} value={reach} label="Reach" />
          <AnalyticsStat icon={TrendingUp} value={engagementRate} label="Engage" isPercentage />
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
    <div className="flex items-center gap-1.5 text-muted-foreground">
      <Icon className="h-3 w-3" />
      <span className="text-[11px] font-semibold font-mono tabular-nums text-foreground">
        <CountUp 
          end={value} 
          decimals={isPercentage ? 1 : 0}
          suffix={isPercentage ? '%' : ''}
        />
      </span>
      <span className="text-[10px]">{label}</span>
    </div>
  );
}
