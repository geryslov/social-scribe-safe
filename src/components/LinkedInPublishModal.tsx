import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Post } from '@/types/post';
import { Linkedin, Loader2, ExternalLink, AlertCircle, Copy } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { PublisherAvatar } from './PublisherAvatar';
import { cn } from '@/lib/utils';

interface LinkedInPublishModalProps {
  isOpen: boolean;
  onClose: () => void;
  post: Post;
  publisherId: string | null;
  isPublisherConnected: boolean;
  onPublishSuccess: (linkedinPostUrl?: string) => void;
  onConnectLinkedIn: () => void;
}

export function LinkedInPublishModal({
  isOpen,
  onClose,
  post,
  publisherId,
  isPublisherConnected,
  onPublishSuccess,
  onConnectLinkedIn,
}: LinkedInPublishModalProps) {
  const [isPublishing, setIsPublishing] = useState(false);

  const characterCount = post.content.length;
  const maxCharacters = 3000; // LinkedIn's limit
  const isOverLimit = characterCount > maxCharacters;

  const handlePublishViaAPI = async () => {
    if (!publisherId) {
      toast.error('Publisher not found');
      return;
    }

    setIsPublishing(true);
    try {
      const { data, error } = await supabase.functions.invoke('linkedin-post', {
        body: {
          publisherId,
          content: post.content,
          postId: post.id,
        },
      });

      if (error) throw error;

      if (data.success) {
        toast.success('Published to LinkedIn!');
        onPublishSuccess(data.linkedinPostUrl);
        onClose();
      } else {
        throw new Error(data.error || 'Failed to publish');
      }
    } catch (error) {
      console.error('Failed to publish:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to publish to LinkedIn');
    } finally {
      setIsPublishing(false);
    }
  };

  const handleCopyAndOpen = async () => {
    try {
      await navigator.clipboard.writeText(post.content);
      const encodedText = encodeURIComponent(post.content);
      const linkedInUrl = `https://www.linkedin.com/feed/?shareActive=true&text=${encodedText}`;
      window.open(linkedInUrl, '_blank');
      toast.success('Copied to clipboard & opened LinkedIn');
      onPublishSuccess();
      onClose();
    } catch {
      toast.error('Failed to copy');
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] bg-card border border-border">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Linkedin className="h-5 w-5 text-[#0077b5]" />
            Publish to LinkedIn
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* Publisher Info */}
          <div className="flex items-center gap-3 p-3 rounded-lg bg-secondary/50">
            <PublisherAvatar name={post.publisherName} size="sm" editable={false} />
            <div>
              <p className="font-medium text-sm">{post.publisherName}</p>
              {post.publisherRole && (
                <p className="text-xs text-muted-foreground">{post.publisherRole}</p>
              )}
            </div>
            {isPublisherConnected ? (
              <span className="ml-auto text-xs text-success flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-success" />
                Connected
              </span>
            ) : (
              <span className="ml-auto text-xs text-muted-foreground flex items-center gap-1">
                <span className="h-2 w-2 rounded-full bg-muted-foreground" />
                Not connected
              </span>
            )}
          </div>

          {/* Post Preview */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-sm font-medium">Post Preview</label>
              <span className={cn(
                "text-xs",
                isOverLimit ? "text-destructive" : "text-muted-foreground"
              )}>
                {characterCount.toLocaleString()} / {maxCharacters.toLocaleString()}
              </span>
            </div>
            <div className="rounded-lg border border-border bg-background p-4 max-h-[200px] overflow-y-auto">
              <p className="text-sm whitespace-pre-wrap">{post.content}</p>
            </div>
            {isOverLimit && (
              <p className="text-xs text-destructive flex items-center gap-1">
                <AlertCircle className="h-3 w-3" />
                Content exceeds LinkedIn's {maxCharacters.toLocaleString()} character limit
              </p>
            )}
          </div>

          {/* Connection Status & Actions */}
          {!isPublisherConnected && (
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-4">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
                <div className="space-y-2">
                  <p className="text-sm font-medium text-amber-500">
                    LinkedIn not connected
                  </p>
                  <p className="text-xs text-muted-foreground">
                    Connect LinkedIn to publish directly. Otherwise, you can copy the content
                    and post manually.
                  </p>
                  <Button
                    variant="outline"
                    size="sm"
                    className="gap-2 border-[#0077b5]/30 text-[#0077b5] hover:bg-[#0077b5]/10"
                    onClick={() => {
                      onClose();
                      onConnectLinkedIn();
                    }}
                  >
                    <Linkedin className="h-4 w-4" />
                    Connect LinkedIn
                  </Button>
                </div>
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          
          {isPublisherConnected ? (
            <Button
              className="gap-2 bg-[#0077b5] hover:bg-[#005885]"
              onClick={handlePublishViaAPI}
              disabled={isPublishing || isOverLimit}
            >
              {isPublishing ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Linkedin className="h-4 w-4" />
              )}
              {isPublishing ? 'Publishing...' : 'Publish to LinkedIn'}
            </Button>
          ) : (
            <Button
              variant="secondary"
              className="gap-2"
              onClick={handleCopyAndOpen}
              disabled={isOverLimit}
            >
              <Copy className="h-4 w-4" />
              Copy & Open LinkedIn
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
