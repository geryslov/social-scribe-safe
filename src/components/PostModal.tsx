import { useState, useEffect, useRef } from 'react';
import { Post } from '@/types/post';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { UserPlus, Loader2, Upload, X, Image, Film } from 'lucide-react';
import { usePublishers } from '@/hooks/usePublishers';
import { supabase } from '@/integrations/supabase/client';
import { useWorkspace } from '@/hooks/useWorkspace';
import { toast } from 'sonner';

interface Publisher {
  name: string;
  role: string;
  linkedinUrl: string;
}

interface PostModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (post: Omit<Post, 'id'> & { id?: string }) => void;
  post?: Post | null;
  existingPublishers: Publisher[];
  preselectedPublisher?: string | null;
}

const MAX_IMAGE_SIZE = 5 * 1024 * 1024; // 5MB
const MAX_VIDEO_SIZE = 20 * 1024 * 1024; // 20MB
const ACCEPTED_TYPES = 'image/jpeg,image/png,image/gif,video/mp4,video/quicktime';

export function PostModal({ 
  isOpen, 
  onClose, 
  onSave, 
  post, 
  existingPublishers,
  preselectedPublisher 
}: PostModalProps) {
  const [isNewPublisher, setIsNewPublisher] = useState(false);
  const [selectedPublisher, setSelectedPublisher] = useState<string>('');
  const { upsertPublisher } = usePublishers();
  const { currentWorkspace } = useWorkspace();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [mediaFile, setMediaFile] = useState<File | null>(null);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [existingMediaUrl, setExistingMediaUrl] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    publisherName: '',
    publisherRole: '',
    linkedinUrl: '',
    content: '',
    scheduledDate: '',
    status: 'draft' as Post['status'],
  });

  useEffect(() => {
    if (!isOpen) return;
    
    setMediaFile(null);
    setMediaPreview(null);
    
    if (post) {
      setFormData({
        publisherName: post.publisherName,
        publisherRole: post.publisherRole,
        linkedinUrl: post.linkedinUrl,
        content: post.content,
        scheduledDate: post.scheduledDate,
        status: post.status,
      });
      setSelectedPublisher(post.publisherName);
      setIsNewPublisher(false);
      setExistingMediaUrl(post.mediaUrl || null);
    } else if (preselectedPublisher) {
      const publisher = existingPublishers.find(p => p.name === preselectedPublisher);
      if (publisher) {
        setFormData({
          publisherName: publisher.name,
          publisherRole: publisher.role,
          linkedinUrl: publisher.linkedinUrl,
          content: '',
          scheduledDate: new Date().toISOString().split('T')[0],
          status: 'draft',
        });
        setSelectedPublisher(publisher.name);
        setIsNewPublisher(false);
      }
      setExistingMediaUrl(null);
    } else {
      setFormData({
        publisherName: '',
        publisherRole: '',
        linkedinUrl: '',
        content: '',
        scheduledDate: new Date().toISOString().split('T')[0],
        status: 'draft',
      });
      setSelectedPublisher('');
      setIsNewPublisher(existingPublishers.length === 0);
      setExistingMediaUrl(null);
    }
  }, [post, existingPublishers, isOpen, preselectedPublisher]);

  const handlePublisherSelect = (publisherName: string) => {
    if (publisherName === '__new__') {
      setIsNewPublisher(true);
      setSelectedPublisher('');
      setFormData(prev => ({
        ...prev,
        publisherName: '',
        publisherRole: '',
        linkedinUrl: '',
      }));
    } else {
      setIsNewPublisher(false);
      setSelectedPublisher(publisherName);
      const publisher = existingPublishers.find(p => p.name === publisherName);
      if (publisher) {
        setFormData(prev => ({
          ...prev,
          publisherName: publisher.name,
          publisherRole: publisher.role,
          linkedinUrl: publisher.linkedinUrl,
        }));
      }
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const isVideo = file.type.startsWith('video/');
    const maxSize = isVideo ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;

    if (file.size > maxSize) {
      toast.error(`File too large. Max ${isVideo ? '20MB' : '5MB'} for ${isVideo ? 'videos' : 'images'}.`);
      return;
    }

    setMediaFile(file);
    setExistingMediaUrl(null);
    const url = URL.createObjectURL(file);
    setMediaPreview(url);
  };

  const handleRemoveMedia = () => {
    setMediaFile(null);
    setMediaPreview(null);
    setExistingMediaUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    if (isNewPublisher && formData.publisherName) {
      try {
        await upsertPublisher.mutateAsync({
          name: formData.publisherName,
          role: formData.publisherRole || undefined,
          linkedin_url: formData.linkedinUrl || undefined,
        });
      } catch (error) {
        console.error('Failed to create publisher:', error);
      }
    }
    
    try {
      let mediaUrl: string | null = existingMediaUrl;

      // Upload new media file if selected
      if (mediaFile && currentWorkspace) {
        const postId = post?.id || crypto.randomUUID();
        const ext = mediaFile.name.split('.').pop();
        const path = `${currentWorkspace.id}/${postId}/${Date.now()}.${ext}`;

        const { error: uploadError } = await supabase.storage
          .from('post-media')
          .upload(path, mediaFile);

        if (uploadError) {
          toast.error('Failed to upload media');
          setIsSubmitting(false);
          return;
        }

        const { data: publicUrlData } = supabase.storage
          .from('post-media')
          .getPublicUrl(path);
        mediaUrl = publicUrlData.publicUrl;
      }

      const saveData = {
        ...formData,
        mediaUrl,
        ...(post ? { id: post.id } : {}),
      };

      onSave(saveData);
      onClose();
    } finally {
      setIsSubmitting(false);
    }
  };

  const currentMediaUrl = mediaPreview || existingMediaUrl;
  const isVideo = mediaFile?.type.startsWith('video/') || existingMediaUrl?.match(/\.(mp4|mov)$/i);

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] bg-card border border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {post ? 'Edit Post' : 'Create New Post'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Publisher Selection */}
          {existingPublishers.length > 0 && (
            <div className="space-y-2">
              <Label>Publisher {post && <span className="text-xs text-muted-foreground">(reassign)</span>}</Label>
              <Select
                value={isNewPublisher ? '__new__' : selectedPublisher}
                onValueChange={handlePublisherSelect}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select a publisher" />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  {existingPublishers.map((publisher) => (
                    <SelectItem key={publisher.name} value={publisher.name}>
                      <div className="flex flex-col items-start">
                        <span className="font-medium">{publisher.name}</span>
                        {publisher.role && (
                          <span className="text-xs text-muted-foreground">{publisher.role}</span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                  <SelectItem value="__new__">
                    <div className="flex items-center gap-2 text-primary">
                      <UserPlus className="h-4 w-4" />
                      <span>Add new publisher</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          )}

          {/* New Publisher Fields */}
          {(isNewPublisher || post || existingPublishers.length === 0) && (
            <>
              <div className="space-y-2">
                <Label htmlFor="linkedinUrl">
                  LinkedIn URL <span className="text-muted-foreground text-xs">(optional)</span>
                </Label>
                <Input
                  id="linkedinUrl"
                  type="url"
                  value={formData.linkedinUrl}
                  onChange={(e) => setFormData({ ...formData, linkedinUrl: e.target.value })}
                  placeholder="https://linkedin.com/in/username"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="publisherName">Publisher Name</Label>
                  <Input
                    id="publisherName"
                    value={formData.publisherName}
                    onChange={(e) => setFormData({ ...formData, publisherName: e.target.value })}
                    placeholder="John Doe"
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="publisherRole">Role / Title</Label>
                  <Input
                    id="publisherRole"
                    value={formData.publisherRole}
                    onChange={(e) => setFormData({ ...formData, publisherRole: e.target.value })}
                    placeholder="VP Marketing"
                  />
                </div>
              </div>
            </>
          )}

          <div className="space-y-2">
            <Label htmlFor="content">Post Content</Label>
            <Textarea
              id="content"
              value={formData.content}
              onChange={(e) => setFormData({ ...formData, content: e.target.value })}
              placeholder="Write your LinkedIn post content here..."
              className="min-h-[150px] resize-none"
              required
            />
          </div>

          {/* Media Upload */}
          <div className="space-y-2">
            <Label>Attach Image / Video <span className="text-muted-foreground text-xs">(optional)</span></Label>
            {currentMediaUrl ? (
              <div className="relative rounded-lg border border-border overflow-hidden bg-secondary/30">
                {isVideo ? (
                  <div className="flex items-center gap-3 p-3">
                    <Film className="h-8 w-8 text-muted-foreground flex-shrink-0" />
                    <span className="text-sm truncate">{mediaFile?.name || 'Video attached'}</span>
                  </div>
                ) : (
                  <img
                    src={currentMediaUrl}
                    alt="Media preview"
                    className="w-full max-h-[160px] object-cover"
                  />
                )}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="absolute top-1 right-1 h-7 w-7 bg-background/80 hover:bg-destructive/20 hover:text-destructive rounded-full"
                  onClick={handleRemoveMedia}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="w-full flex items-center justify-center gap-2 rounded-lg border border-dashed border-border p-4 text-sm text-muted-foreground hover:border-primary/40 hover:text-primary transition-colors"
              >
                <Upload className="h-4 w-4" />
                Click to upload (images up to 5MB, videos up to 20MB)
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPTED_TYPES}
              className="hidden"
              onChange={handleFileSelect}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="scheduledDate">Scheduled Date</Label>
              <Input
                id="scheduledDate"
                type="date"
                value={formData.scheduledDate}
                onChange={(e) => setFormData({ ...formData, scheduledDate: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value: Post['status']) => setFormData({ ...formData, status: value })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover border border-border">
                  <SelectItem value="draft">Draft</SelectItem>
                  <SelectItem value="scheduled">Scheduled</SelectItem>
                  <SelectItem value="done">Published</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" className="gradient-bg" disabled={isSubmitting}>
              {isSubmitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  {post ? 'Saving...' : 'Creating...'}
                </>
              ) : (
                post ? 'Save Changes' : 'Create Post'
              )}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
