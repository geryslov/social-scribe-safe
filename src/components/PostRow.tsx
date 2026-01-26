import { useState } from 'react';
import { Post } from '@/types/post';
import { Button } from '@/components/ui/button';
import { Copy, Pencil, Trash2, Check, Calendar, ExternalLink, Undo2, ChevronDown, ChevronUp, Linkedin, Eye, Users, Heart, MessageCircle, Share2, TrendingUp } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { EditHistory } from './EditHistory';
import { PublisherAvatar } from './PublisherAvatar';
import { LinkedInPublishModal } from './LinkedInPublishModal';
import { usePublishers } from '@/hooks/usePublishers';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

// Publisher color palette
const publisherColors = [
  { bg: 'bg-rose-500/15', text: 'text-rose-400', border: 'border-rose-500/30', avatar: 'bg-gradient-to-br from-rose-500 to-pink-600' },
  { bg: 'bg-amber-500/15', text: 'text-amber-400', border: 'border-amber-500/30', avatar: 'bg-gradient-to-br from-amber-500 to-orange-600' },
  { bg: 'bg-emerald-500/15', text: 'text-emerald-400', border: 'border-emerald-500/30', avatar: 'bg-gradient-to-br from-emerald-500 to-teal-600' },
  { bg: 'bg-sky-500/15', text: 'text-sky-400', border: 'border-sky-500/30', avatar: 'bg-gradient-to-br from-sky-500 to-blue-600' },
  { bg: 'bg-violet-500/15', text: 'text-violet-400', border: 'border-violet-500/30', avatar: 'bg-gradient-to-br from-violet-500 to-purple-600' },
  { bg: 'bg-cyan-500/15', text: 'text-cyan-400', border: 'border-cyan-500/30', avatar: 'bg-gradient-to-br from-cyan-500 to-teal-600' },
  { bg: 'bg-fuchsia-500/15', text: 'text-fuchsia-400', border: 'border-fuchsia-500/30', avatar: 'bg-gradient-to-br from-fuchsia-500 to-pink-600' },
  { bg: 'bg-lime-500/15', text: 'text-lime-400', border: 'border-lime-500/30', avatar: 'bg-gradient-to-br from-lime-500 to-green-600' },
];

const getPublisherColor = (name: string) => {
  let hash = 0;
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash);
  }
  return publisherColors[Math.abs(hash) % publisherColors.length];
};

interface PostRowProps {
  post: Post & {
    impressions?: number | null;
    unique_impressions?: number | null;
    reactions?: number | null;
    comments_count?: number | null;
    reshares?: number | null;
    engagement_rate?: number | null;
  };
  onEdit: (post: Post) => void;
  onDelete: (postId: string) => void;
  onStatusChange?: (postId: string, status: Post['status'], publisherName?: string) => void;
  showPublisher?: boolean;
  index: number;
  isAdmin?: boolean;
}

export function PostRow({ post, onEdit, onDelete, onStatusChange, showPublisher = false, index, isAdmin = false }: PostRowProps) {
  const [copied, setCopied] = useState(false);
  const [showPublishDialog, setShowPublishDialog] = useState(false);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  
  const { publishers } = usePublishers();
  const queryClient = useQueryClient();
  
  // Find the publisher for this post
  const publisher = publishers.find(p => p.name === post.publisherName);
  const isPublisherConnected = publisher?.linkedin_connected ?? false;

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(post.content);
      setCopied(true);
      setShowPublishDialog(true);
    } catch {
      toast.error('Failed to copy');
    }
  };

  const handlePublishClick = () => {
    setShowLinkedInModal(true);
  };

  const handlePublishSuccess = (linkedinPostUrl?: string) => {
    if (onStatusChange && post.status !== 'done') {
      onStatusChange(post.id, 'done', post.publisherName);
    }
    queryClient.invalidateQueries({ queryKey: ['posts'] });
    if (linkedinPostUrl) {
      toast.success('Published to LinkedIn!', {
        action: {
          label: 'View Post',
          onClick: () => window.open(linkedinPostUrl, '_blank'),
        },
      });
    }
  };

  const handleConnectLinkedIn = () => {
    // Close the publish modal and prompt user to edit the publisher
    toast.info('Edit the publisher to connect LinkedIn');
  };

  const handlePublishConfirm = (markAsPublished: boolean) => {
    if (markAsPublished && onStatusChange) {
      onStatusChange(post.id, 'done', post.publisherName);
      toast.success('Copied & marked as published');
    } else {
      toast.success('Copied to clipboard');
    }
    setCopied(false);
    setShowPublishDialog(false);
  };

  const formatDate = (dateString: string) => {
    return new Date(dateString).toLocaleDateString('en-GB', {
      day: '2-digit',
      month: 'short',
    });
  };

  const getStatusConfig = (status: Post['status']) => {
    switch (status) {
      case 'done': 
        return { 
          label: 'Published',
          className: 'bg-success/15 text-success border-success/20',
        };
      case 'scheduled': 
        return { 
          label: 'Scheduled',
          className: 'bg-info/15 text-info border-info/20',
        };
      case 'draft': 
        return { 
          label: 'Draft',
          className: 'bg-muted text-muted-foreground border-border',
        };
      default: 
        return { 
          label: status,
          className: 'bg-muted text-muted-foreground border-border',
        };
    }
  };

  const statusConfig = getStatusConfig(post.status);
  const publisherColor = getPublisherColor(post.publisherName);

  return (
    <>
      <div 
        className="group card-elevated hover-lift p-5 animate-slide-up transition-all duration-300"
        style={{ animationDelay: `${index * 0.05}s`, animationFillMode: 'backwards' }}
      >
        <div className="flex gap-4">
          {/* Publisher Avatar */}
          {showPublisher && (
            <div className="flex-shrink-0">
              <PublisherAvatar 
                name={post.publisherName} 
                size="md" 
                editable={false}
                className="shadow-lg"
              />
            </div>
          )}
          
          {/* Content */}
          <div className="flex-1 min-w-0">
            {showPublisher && (
              <div className="flex items-center gap-2 mb-2">
                <span className={cn("font-semibold", publisherColor.text)}>{post.publisherName}</span>
                {post.linkedinUrl && (
                  <a
                    href={post.linkedinUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:text-primary/80 transition-colors"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
                {post.publisherRole && (
                  <span className="text-xs text-muted-foreground bg-secondary px-2 py-0.5 rounded-md">
                    {post.publisherRole}
                  </span>
                )}
                {isPublisherConnected && (
                  <span className="text-xs text-[#0077b5] flex items-center gap-1">
                    <Linkedin className="h-3 w-3" />
                  </span>
                )}
              </div>
            )}
            
            <div 
              className="cursor-pointer"
              onClick={() => setIsExpanded(!isExpanded)}
            >
              <p className={cn(
                "text-sm text-foreground/85 leading-relaxed mb-2 whitespace-pre-wrap",
                !isExpanded && "line-clamp-2"
              )}>
                {post.content}
              </p>
              {post.content.length > 150 && (
                <button className="text-xs text-primary hover:text-primary/80 flex items-center gap-1 mb-2">
                  {isExpanded ? (
                    <>
                      <ChevronUp className="h-3 w-3" />
                      Show less
                    </>
                  ) : (
                    <>
                      <ChevronDown className="h-3 w-3" />
                      Read more
                    </>
                  )}
                </button>
              )}
            </div>
            
            <div className="flex items-center gap-3 flex-wrap">
              <span className={cn(
                "inline-flex items-center px-2.5 py-1 rounded-lg text-xs font-medium border",
                statusConfig.className
              )}>
                {statusConfig.label}
              </span>
              <span className="text-xs text-muted-foreground flex items-center gap-1.5">
                <Calendar className="h-3.5 w-3.5" />
                {formatDate(post.scheduledDate)}
              </span>
              
              {/* LinkedIn Post URL for published posts */}
              {post.status === 'done' && post.linkedinPostUrl && (
                <a
                  href={post.linkedinPostUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-[#0077b5] hover:underline flex items-center gap-1"
                >
                  <Linkedin className="h-3 w-3" />
                  View on LinkedIn
                </a>
              )}
              
              {/* Publish method badge */}
              {post.status === 'done' && post.publishMethod && (
                <span className="text-xs text-muted-foreground">
                  via {post.publishMethod === 'linkedin_api' ? 'API' : post.publishMethod}
                </span>
              )}
            </div>
            
            {/* Analytics for published posts */}
            {post.status === 'done' && post.publishMethod === 'linkedin_api' && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2 pt-2 border-t border-border/50">
                {(post.impressions ?? 0) > 0 && (
                  <div className="flex items-center gap-1" title="Total Impressions">
                    <Eye className="h-3 w-3" />
                    <span>{(post.impressions ?? 0).toLocaleString()}</span>
                  </div>
                )}
                {(post.unique_impressions ?? 0) > 0 && (
                  <div className="flex items-center gap-1" title="Unique Reach">
                    <Users className="h-3 w-3" />
                    <span>{(post.unique_impressions ?? 0).toLocaleString()}</span>
                  </div>
                )}
                {(post.reactions ?? 0) > 0 && (
                  <div className="flex items-center gap-1" title="Reactions">
                    <Heart className="h-3 w-3" />
                    <span>{post.reactions ?? 0}</span>
                  </div>
                )}
                {(post.comments_count ?? 0) > 0 && (
                  <div className="flex items-center gap-1" title="Comments">
                    <MessageCircle className="h-3 w-3" />
                    <span>{post.comments_count ?? 0}</span>
                  </div>
                )}
                {(post.reshares ?? 0) > 0 && (
                  <div className="flex items-center gap-1" title="Reshares">
                    <Share2 className="h-3 w-3" />
                    <span>{post.reshares ?? 0}</span>
                  </div>
                )}
                {post.engagement_rate !== null && (post.engagement_rate ?? 0) > 0 && (
                  <div className="flex items-center gap-1" title="Engagement Rate">
                    <TrendingUp className="h-3 w-3" />
                    <span>{post.engagement_rate?.toFixed(1)}%</span>
                  </div>
                )}
              </div>
            )}
            
            {/* Edit History - only visible to admins */}
            {isAdmin && <EditHistory postId={post.id} />}
          </div>
          
          {/* Actions - visible on hover */}
          <div className="flex-shrink-0 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity duration-200">
            {post.status === 'done' && isAdmin && onStatusChange && (
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 hover:bg-secondary"
                onClick={() => {
                  onStatusChange(post.id, 'scheduled');
                  toast.success('Moved back to upcoming');
                }}
                title="Move back to upcoming"
              >
                <Undo2 className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-3 hover:bg-[#0077b5]/10 hover:text-[#0077b5] text-xs gap-1.5"
              onClick={handlePublishClick}
            >
              <Linkedin className="h-4 w-4" />
              Publish
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-secondary"
              onClick={handleCopy}
            >
              {copied ? <Check className="h-4 w-4 text-success" /> : <Copy className="h-4 w-4" />}
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-secondary"
              onClick={() => onEdit(post)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 hover:bg-destructive/10 hover:text-destructive"
              onClick={() => onDelete(post.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* LinkedIn Publish Modal */}
      <LinkedInPublishModal
        isOpen={showLinkedInModal}
        onClose={() => setShowLinkedInModal(false)}
        post={post}
        publisherId={publisher?.id ?? null}
        isPublisherConnected={isPublisherConnected}
        onPublishSuccess={handlePublishSuccess}
        onConnectLinkedIn={handleConnectLinkedIn}
      />

      <AlertDialog open={showPublishDialog} onOpenChange={setShowPublishDialog}>
        <AlertDialogContent className="bg-card border border-border">
          <AlertDialogHeader>
            <AlertDialogTitle>Mark as Published?</AlertDialogTitle>
            <AlertDialogDescription>
              Content copied to clipboard. Has this post been published on LinkedIn?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => handlePublishConfirm(false)}>
              No, just copied
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => handlePublishConfirm(true)} className="gradient-bg">
              Yes, mark as published
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
