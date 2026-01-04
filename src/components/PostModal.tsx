import { useState, useEffect } from 'react';
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
import { UserPlus } from 'lucide-react';
import { usePublishers } from '@/hooks/usePublishers';

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // If creating a new publisher, save the publisher first
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
    
    onSave(post ? { ...formData, id: post.id } : formData);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[550px] bg-card border border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
            {post ? 'Edit Post' : 'Create New Post'}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-4">
          {/* Publisher Selection - show for new posts and editing existing posts */}
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
              {/* LinkedIn URL */}
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
            <Button type="submit" className="gradient-bg">
              {post ? 'Save Changes' : 'Create Post'}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
