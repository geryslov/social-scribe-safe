import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, LinkIcon } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useWorkspace } from '@/hooks/useWorkspace';
import { usePublishers } from '@/hooks/usePublishers';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

interface TrackExternalPostModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/**
 * Extract a LinkedIn post URN from a URL or raw URN string.
 * Supports:
 *  - Direct URNs: urn:li:share:123, urn:li:ugcPost:123
 *  - Post URLs: linkedin.com/feed/update/urn:li:activity:123
 *  - Activity URLs: linkedin.com/posts/username_activity-123-...
 */
function extractPostUrn(input: string): string | null {
  const trimmed = input.trim();

  // Direct URN
  if (trimmed.startsWith('urn:li:')) return trimmed;

  // URL with urn in path: /feed/update/urn:li:activity:123
  const urnMatch = trimmed.match(/(urn:li:(?:activity|share|ugcPost):\d+)/);
  if (urnMatch) return urnMatch[1];

  // Activity ID from vanity URL: /posts/name_activity-1234567-
  const activityMatch = trimmed.match(/activity[:\-](\d+)/);
  if (activityMatch) return `urn:li:activity:${activityMatch[1]}`;

  return null;
}

export function TrackExternalPostModal({ open, onOpenChange }: TrackExternalPostModalProps) {
  const { user } = useAuth();
  const { currentWorkspace } = useWorkspace();
  const { publishers } = usePublishers();
  const queryClient = useQueryClient();

  const [url, setUrl] = useState('');
  const [postContent, setPostContent] = useState('');
  const [selectedPublisher, setSelectedPublisher] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const connectedPublishers = publishers.filter(p => p.linkedin_connected);

  const handleSubmit = async () => {
    if (!user || !currentWorkspace) return;

    const urn = extractPostUrn(url);
    if (!urn) {
      toast.error('Could not extract a LinkedIn post URN from that URL. Please paste a LinkedIn post URL or URN.');
      return;
    }

    if (!selectedPublisher) {
      toast.error('Please select a publisher');
      return;
    }

    const publisher = publishers.find(p => p.id === selectedPublisher);
    if (!publisher) return;

    setIsSubmitting(true);
    try {
      // Check for duplicate URN
      const { data: existing } = await supabase
        .from('posts')
        .select('id')
        .eq('linkedin_post_urn', urn)
        .maybeSingle();

      if (existing) {
        toast.error('This post is already being tracked');
        setIsSubmitting(false);
        return;
      }

      // Create a tracked post entry
      const { error } = await supabase
        .from('posts')
        .insert({
          content: `[Tracked external post]`,
          status: 'done',
          scheduled_date: new Date().toISOString().split('T')[0],
          publisher_name: publisher.name,
          publisher_role: publisher.role || null,
          linkedin_url: publisher.linkedin_url || null,
          created_by: user.id,
          workspace_id: currentWorkspace.id,
          linkedin_post_urn: urn,
          publish_method: 'manual',
          published_at: new Date().toISOString(),
        });

      if (error) throw error;

      // Trigger analytics sync for this publisher
      supabase.functions.invoke('fetch-linkedin-posts', {
        body: { publisherId: publisher.id },
      }).then(() => {
        queryClient.invalidateQueries({ queryKey: ['posts'] });
        queryClient.invalidateQueries({ queryKey: ['analytics-posts'] });
        queryClient.invalidateQueries({ queryKey: ['app-published-posts'] });
      }).catch(console.error);

      queryClient.invalidateQueries({ queryKey: ['posts'] });
      toast.success('Post added for tracking! Analytics will sync shortly.');
      setUrl('');
      setSelectedPublisher('');
      onOpenChange(false);
    } catch (err) {
      console.error('Error tracking external post:', err);
      toast.error('Failed to add post for tracking');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <LinkIcon className="h-5 w-5 text-primary" />
            Track External Post
          </DialogTitle>
          <DialogDescription>
            Paste a LinkedIn post URL or URN to start tracking its analytics. The post must belong to the selected publisher's LinkedIn account.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          <div className="space-y-2">
            <Label htmlFor="linkedin-url">LinkedIn Post URL or URN</Label>
            <Input
              id="linkedin-url"
              placeholder="https://linkedin.com/feed/update/urn:li:activity:123..."
              value={url}
              onChange={(e) => setUrl(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">
              Supports post URLs, activity URLs, or raw URNs (urn:li:share:..., urn:li:ugcPost:..., urn:li:activity:...)
            </p>
          </div>

          <div className="space-y-2">
            <Label>Publisher (must be LinkedIn-connected)</Label>
            <Select value={selectedPublisher} onValueChange={setSelectedPublisher}>
              <SelectTrigger>
                <SelectValue placeholder="Select publisher..." />
              </SelectTrigger>
              <SelectContent>
                {connectedPublishers.map((pub) => (
                  <SelectItem key={pub.id} value={pub.id}>
                    {pub.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {connectedPublishers.length === 0 && (
              <p className="text-xs text-destructive">
                No publishers with LinkedIn connected. Connect a publisher first.
              </p>
            )}
          </div>

          <Button
            onClick={handleSubmit}
            disabled={!url || !selectedPublisher || isSubmitting}
            className="w-full"
          >
            {isSubmitting ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Adding...
              </>
            ) : (
              'Track Post'
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
