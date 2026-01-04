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
import { Loader2 } from 'lucide-react';
import { usePublishers, Publisher } from '@/hooks/usePublishers';
import { toast } from 'sonner';

interface PublisherModalProps {
  isOpen: boolean;
  onClose: () => void;
  publisher?: Publisher | null;
}

export function PublisherModal({ isOpen, onClose, publisher }: PublisherModalProps) {
  const { upsertPublisher } = usePublishers();
  const [formData, setFormData] = useState({
    name: '',
    role: '',
    linkedin_url: '',
  });

  useEffect(() => {
    if (isOpen) {
      if (publisher) {
        setFormData({
          name: publisher.name,
          role: publisher.role || '',
          linkedin_url: publisher.linkedin_url || '',
        });
      } else {
        setFormData({
          name: '',
          role: '',
          linkedin_url: '',
        });
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

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-[450px] bg-card border border-border">
        <DialogHeader>
          <DialogTitle className="text-xl font-semibold">
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