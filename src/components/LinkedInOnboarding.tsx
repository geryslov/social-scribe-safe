import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Linkedin, Loader2, User, Briefcase } from 'lucide-react';
import { usePublishers } from '@/hooks/usePublishers';
import { useAuth } from '@/hooks/useAuth';
import { LinkedInConnectButton } from './LinkedInConnectButton';
import { toast } from 'sonner';

interface LinkedInOnboardingProps {
  isOpen: boolean;
  onComplete: () => void;
}

export function LinkedInOnboarding({ isOpen, onComplete }: LinkedInOnboardingProps) {
  const { user } = useAuth();
  const { publishers, upsertPublisher } = usePublishers();
  const [step, setStep] = useState<'info' | 'connect'>('info');
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [createdPublisherId, setCreatedPublisherId] = useState<string | null>(null);

  // Pre-fill name from Google account if available
  useEffect(() => {
    if (user?.user_metadata?.full_name) {
      setName(user.user_metadata.full_name);
    } else if (user?.user_metadata?.name) {
      setName(user.user_metadata.name);
    }
  }, [user]);

  // Check if user already has a publisher profile
  useEffect(() => {
    if (user?.email && publishers.length > 0) {
      // Check if there's already a publisher for this user
      const existingPublisher = publishers.find(
        p => p.name === user.user_metadata?.full_name || p.name === user.user_metadata?.name
      );
      if (existingPublisher) {
        onComplete();
      }
    }
  }, [user, publishers, onComplete]);

  const handleCreatePublisher = async () => {
    if (!name.trim()) {
      toast.error('Please enter your name');
      return;
    }

    setIsSubmitting(true);
    try {
      const result = await upsertPublisher.mutateAsync({
        name: name.trim(),
        role: role.trim() || undefined,
        linkedin_url: linkedinUrl.trim() || undefined,
      });
      
      setCreatedPublisherId(result.id);
      setStep('connect');
      toast.success('Profile created! Now connect your LinkedIn account.');
    } catch (error) {
      toast.error('Failed to create profile');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConnectionChange = () => {
    toast.success('LinkedIn connected successfully!');
    onComplete();
  };

  const handleSkip = () => {
    onComplete();
  };

  return (
    <Dialog open={isOpen} onOpenChange={() => {}}>
      <DialogContent className="sm:max-w-md" onPointerDownOutside={(e) => e.preventDefault()}>
        <DialogHeader>
          <div className="flex items-center justify-center mb-4">
            <div className="flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10">
              <Linkedin className="h-7 w-7 text-primary" />
            </div>
          </div>
          <DialogTitle className="text-center text-xl">
            {step === 'info' ? 'Create Your Publisher Profile' : 'Connect LinkedIn'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {step === 'info' 
              ? 'Set up your profile to start publishing posts'
              : 'Connect your LinkedIn account to publish directly'
            }
          </DialogDescription>
        </DialogHeader>

        {step === 'info' ? (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="name">Full Name *</Label>
              <div className="relative">
                <User className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="name"
                  placeholder="Your full name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="role">Role / Title</Label>
              <div className="relative">
                <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="role"
                  placeholder="e.g. CEO, Marketing Manager"
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="linkedin">LinkedIn Profile URL</Label>
              <div className="relative">
                <Linkedin className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  id="linkedin"
                  placeholder="https://linkedin.com/in/yourprofile"
                  value={linkedinUrl}
                  onChange={(e) => setLinkedinUrl(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            <div className="flex gap-3 pt-4">
              <Button 
                variant="outline" 
                onClick={handleSkip}
                className="flex-1"
              >
                Skip for now
              </Button>
              <Button 
                onClick={handleCreatePublisher}
                disabled={isSubmitting || !name.trim()}
                className="flex-1 gradient-bg"
              >
                {isSubmitting ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  'Continue'
                )}
              </Button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 py-4">
            <div className="text-center p-4 bg-muted/50 rounded-lg">
              <p className="text-sm text-muted-foreground mb-4">
                Connecting your LinkedIn account allows you to publish posts directly from this platform.
              </p>
              
              {createdPublisherId && (
                <LinkedInConnectButton
                  publisherId={createdPublisherId}
                  isConnected={false}
                  onConnectionChange={handleConnectionChange}
                />
              )}
            </div>

            <Button 
              variant="ghost" 
              onClick={handleSkip}
              className="w-full"
            >
              Skip for now
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
