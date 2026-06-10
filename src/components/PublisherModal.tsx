import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Separator } from '@/components/ui/separator';
import { Loader2, Sparkles, RefreshCw, Mic, Check } from 'lucide-react';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { toast } from 'sonner';
import { LinkedInConnectButton } from './LinkedInConnectButton';
import { useQueryClient } from '@tanstack/react-query';
import { cn } from '@/lib/utils';

interface PublisherModalProps {
  isOpen: boolean;
  onClose: () => void;
  publisher?: Publisher | null;
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

export function PublisherModal({ isOpen, onClose, publisher }: PublisherModalProps) {
  const { upsertPublisher, generateVoiceProfile, updateVoiceProfile } = usePublishers();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    linkedin_url: '',
  });
  const [editingVoice, setEditingVoice] = useState(false);
  const [voiceText, setVoiceText] = useState('');

  useEffect(() => {
    if (isOpen) {
      if (publisher) {
        setFormData({
          name: publisher.name,
          role: publisher.role || '',
          linkedin_url: publisher.linkedin_url || '',
        });
        setVoiceText(publisher.voice_profile || '');
        setEditingVoice(false);
      } else {
        setFormData({ name: '', role: '', linkedin_url: '' });
        setVoiceText('');
        setEditingVoice(false);
      }
    }
  }, [isOpen, publisher]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      await upsertPublisher.mutateAsync({
        name: formData.name,
        role: formData.role || undefined,
        linkedin_url: formData.linkedin_url || undefined,
      });

      toast.success(publisher ? 'Publisher updated' : 'Publisher created');
      onClose();
    } catch (error) {
      console.error('Failed to save publisher:', error);
      toast.error('Failed to save publisher');
    }
  };

  const handleGenerateVoice = () => {
    if (!publisher) return;
    generateVoiceProfile.mutate(publisher.id, {
      onSuccess: (data) => {
        setVoiceText(data.voice_profile);
      },
    });
  };

  const handleSaveVoice = () => {
    if (!publisher) return;
    updateVoiceProfile.mutate(
      { publisherId: publisher.id, voiceProfile: voiceText },
      { onSuccess: () => setEditingVoice(false) },
    );
  };

  const handleConnectionChange = () => {
    queryClient.invalidateQueries({ queryKey: ['publishers'] });
  };

  const hasVoiceProfile = !!publisher?.voice_profile;
  const hasLinkedIn = !!formData.linkedin_url;

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className={cn(
        'bg-card border border-border',
        publisher ? 'sm:max-w-[600px]' : 'sm:max-w-[450px]',
      )}>
        <DialogHeader>
          <DialogTitle className="text-xl font-display font-semibold">
            {publisher ? 'Edit Publisher' : 'Add Publisher'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          <div className="space-y-2">
            <Label htmlFor="name">Name *</Label>
            <Input
              id="name"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="John Doe"
              required
              disabled={!!publisher}
            />
            {publisher && (
              <p className="text-xs text-muted-foreground">Name cannot be changed</p>
            )}
          </div>

          <div className="space-y-2">
            <Label htmlFor="role">Role / Title</Label>
            <Input
              id="role"
              value={formData.role}
              onChange={(e) => setFormData({ ...formData, role: e.target.value })}
              placeholder="VP Marketing"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="linkedin_url">LinkedIn URL <span className="text-muted-foreground text-xs">(optional)</span></Label>
            <Input
              id="linkedin_url"
              type="url"
              value={formData.linkedin_url}
              onChange={(e) => setFormData({ ...formData, linkedin_url: e.target.value })}
              placeholder="https://linkedin.com/in/username"
            />
          </div>

          {/* LinkedIn OAuth Connection */}
          {publisher && (
            <div className="space-y-2 pt-2 border-t border-border">
              <Label>LinkedIn Publishing</Label>
              <p className="text-xs text-muted-foreground mb-2">
                Connect LinkedIn to publish posts directly via the API
              </p>
              <LinkedInConnectButton
                publisherId={publisher.id}
                isConnected={publisher.linkedin_connected ?? false}
                onConnectionChange={handleConnectionChange}
              />
            </div>
          )}

          {/* Voice Profile Section — only for existing publishers */}
          {publisher && (
            <div className="pt-2 border-t border-border space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Mic className={cn('h-4 w-4', hasVoiceProfile ? 'text-primary' : 'text-muted-foreground')} />
                  <Label className="mb-0">Voice Profile</Label>
                  {hasVoiceProfile && (
                    <span className="flex items-center gap-1 text-[10px] text-primary font-medium">
                      <Check className="h-3 w-3" />
                      Active
                    </span>
                  )}
                </div>
                {publisher.voice_profile_generated_at && (
                  <span className="text-[10px] text-muted-foreground">
                    Generated {timeAgo(publisher.voice_profile_generated_at)}
                  </span>
                )}
              </div>

              <p className="text-xs text-muted-foreground">
                {hasVoiceProfile
                  ? 'This profile guides how posts and comments are written for this publisher.'
                  : 'Generate a voice profile to personalize post and comment writing to match this publisher\'s authentic tone.'}
              </p>

              {/* Voice profile content */}
              {hasVoiceProfile && !editingVoice && (
                <div className="bg-muted/30 rounded-md p-3 max-h-[200px] overflow-y-auto">
                  <pre className="text-xs text-foreground/80 whitespace-pre-wrap font-sans leading-relaxed">
                    {publisher.voice_profile}
                  </pre>
                </div>
              )}

              {editingVoice && (
                <div className="space-y-2">
                  <Textarea
                    value={voiceText}
                    onChange={(e) => setVoiceText(e.target.value)}
                    rows={10}
                    className="text-xs font-sans leading-relaxed"
                    placeholder="Voice profile content..."
                  />
                  <div className="flex gap-2 justify-end">
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => { setEditingVoice(false); setVoiceText(publisher.voice_profile || ''); }}
                    >
                      Cancel
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={handleSaveVoice}
                      disabled={updateVoiceProfile.isPending}
                    >
                      {updateVoiceProfile.isPending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                      Save Profile
                    </Button>
                  </div>
                </div>
              )}

              {/* Actions */}
              {!editingVoice && (
                <div className="flex gap-2">
                  {!hasVoiceProfile ? (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="gap-1.5 border-primary/30 text-primary hover:bg-primary/10"
                      onClick={handleGenerateVoice}
                      disabled={generateVoiceProfile.isPending || !hasLinkedIn}
                      title={!hasLinkedIn ? 'Add a LinkedIn URL first' : undefined}
                    >
                      {generateVoiceProfile.isPending ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Sparkles className="h-3.5 w-3.5" />
                      )}
                      {generateVoiceProfile.isPending ? 'Analyzing...' : 'Generate Voice Profile'}
                    </Button>
                  ) : (
                    <>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => setEditingVoice(true)}
                      >
                        Edit
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={handleGenerateVoice}
                        disabled={generateVoiceProfile.isPending}
                      >
                        {generateVoiceProfile.isPending ? (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        ) : (
                          <RefreshCw className="h-3 w-3" />
                        )}
                        Regenerate
                      </Button>
                    </>
                  )}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="gradient-bg" disabled={upsertPublisher.isPending}>
              {upsertPublisher.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {publisher ? 'Save Changes' : 'Add Publisher'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
