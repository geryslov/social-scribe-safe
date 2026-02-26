import { useState, useRef, useEffect } from 'react';
import { Check, Trash2, User, Linkedin, RefreshCw, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { DocumentSection } from '@/hooks/useDocuments';
import { SectionEditHistory } from '@/components/SectionEditHistory';
import { DocumentPublisherSelect, PublisherBadge } from '@/components/DocumentPublisherSelect';
import { usePublishers } from '@/hooks/usePublishers';
import { LinkedInPublishModal } from './LinkedInPublishModal';
import { Post } from '@/types/post';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

const TONE_OPTIONS = [
  { value: 'professional', label: '💼 Professional' },
  { value: 'casual', label: '😊 Casual' },
  { value: 'bold', label: '🔥 Bold' },
  { value: 'storytelling', label: '📖 Storytelling' },
  { value: 'data_driven', label: '📊 Data-Driven' },
  { value: 'inspirational', label: '✨ Inspirational' },
  { value: 'humorous', label: '😄 Humorous' },
  { value: 'contrarian', label: '🤔 Contrarian' },
];

const LENGTH_OPTIONS = [
  { value: 'short', label: 'Short (80-120 words)' },
  { value: 'medium', label: 'Medium (150-250 words)' },
  { value: 'long', label: 'Long (300-450 words)' },
];

interface DocumentSectionCardProps {
  section: DocumentSection;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onPublisherChange: (id: string, publisherId: string | null) => void;
  workspaceSystemPrompt?: string;
}

export function DocumentSectionCard({ 
  section, 
  onUpdate, 
  onDelete,
  onApprove,
  onPublisherChange,
  workspaceSystemPrompt
}: DocumentSectionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
  const [isRewriting, setIsRewriting] = useState(false);
  const [redoTone, setRedoTone] = useState('professional');
  const [redoLength, setRedoLength] = useState('medium');
  const [redoOpen, setRedoOpen] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { publishers } = usePublishers();
  const queryClient = useQueryClient();

  const assignedPublisher = publishers.find(p => p.id === section.publisherId);
  const isPublisherConnected = assignedPublisher?.linkedin_connected ?? false;

  useEffect(() => {
    setEditContent(section.content);
  }, [section.content]);

  useEffect(() => {
    if (isEditing && textareaRef.current) {
      textareaRef.current.focus();
      textareaRef.current.selectionStart = textareaRef.current.value.length;
    }
  }, [isEditing]);

  const handleBlur = () => {
    if (editContent.trim() !== section.content) {
      onUpdate(section.id, editContent);
    }
    setIsEditing(false);
  };

  const handleContentClick = () => {
    if (!isEditing) {
      setIsEditing(true);
    }
  };

  const handleRewrite = async () => {
    setIsRewriting(true);
    setRedoOpen(false);
    try {
      const { data, error } = await supabase.functions.invoke('rewrite-section', {
        body: {
          content: section.content,
          tone: redoTone,
          length: redoLength,
          workspaceSystemPrompt: workspaceSystemPrompt || '',
        },
      });

      if (error) {
        console.error('Rewrite error:', error);
        toast.error('Failed to rewrite post');
        return;
      }

      if (data?.success && data.content) {
        onUpdate(section.id, data.content);
        toast.success('Post rewritten successfully');
      } else {
        toast.error(data?.error || 'Failed to rewrite post');
      }
    } catch (err) {
      console.error('Rewrite error:', err);
      toast.error('Failed to rewrite post');
    } finally {
      setIsRewriting(false);
    }
  };

  // Build a Post-like object for the LinkedIn publish modal
  const postForPublish: Post = {
    id: section.id,
    content: section.content,
    publisherName: assignedPublisher?.name || '',
    publisherRole: assignedPublisher?.role || '',
    linkedinUrl: assignedPublisher?.linkedin_url || '',
    scheduledDate: new Date().toISOString().split('T')[0],
    status: 'scheduled',
  };

  const handlePublishSuccess = (linkedinPostUrl?: string) => {
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
    toast.info('Edit the publisher to connect LinkedIn');
  };

  const statusColors: Record<string, string> = {
    pending: 'bg-yellow-500/20 text-yellow-600',
    approved: 'bg-green-500/20 text-green-600',
    rejected: 'bg-red-500/20 text-red-600',
  };

  return (
    <>
      <div className="border border-border rounded-lg p-4 bg-card space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">
              Post {section.sectionNumber}
            </span>
            <Badge variant="secondary" className={statusColors[section.status] || ''}>
              {section.status}
            </Badge>
            {assignedPublisher && <PublisherBadge publisher={assignedPublisher} />}
          </div>
          
          <div className="flex items-center gap-1">
            {/* Redo with AI */}
            <Popover open={redoOpen} onOpenChange={setRedoOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-xs gap-1"
                  disabled={isRewriting}
                >
                  {isRewriting ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3.5 w-3.5" />
                  )}
                  {isRewriting ? 'Rewriting...' : 'Redo'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-64 space-y-3" align="end">
                <p className="text-sm font-medium">Rewrite with AI</p>
                
                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Tone</label>
                  <Select value={redoTone} onValueChange={setRedoTone}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {TONE_OPTIONS.map(t => (
                        <SelectItem key={t.value} value={t.value} className="text-xs">
                          {t.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <label className="text-xs text-muted-foreground mb-1 block">Length</label>
                  <Select value={redoLength} onValueChange={setRedoLength}>
                    <SelectTrigger className="h-8 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {LENGTH_OPTIONS.map(l => (
                        <SelectItem key={l.value} value={l.value} className="text-xs">
                          {l.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <Button size="sm" className="w-full" onClick={handleRewrite}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1.5" />
                  Rewrite
                </Button>
              </PopoverContent>
            </Popover>

            {/* Push to LinkedIn button */}
            {assignedPublisher && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 px-2 text-xs gap-1 hover:bg-[#0077b5]/10 hover:text-[#0077b5]"
                onClick={() => setShowLinkedInModal(true)}
                title="Push to LinkedIn"
              >
                <Linkedin className="h-3.5 w-3.5" />
                Push
              </Button>
            )}
            {section.status === 'pending' && (
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-green-600"
                onClick={() => onApprove(section.id)}
              >
                <Check className="h-4 w-4" />
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 text-destructive"
              onClick={() => onDelete(section.id)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {isEditing ? (
          <Textarea
            ref={textareaRef}
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            onBlur={handleBlur}
            className="min-h-32 resize-none"
          />
        ) : (
          <p 
            className="text-sm whitespace-pre-wrap cursor-text hover:bg-muted/50 rounded p-2 -m-2 transition-colors"
            onClick={handleContentClick}
          >
            {section.content}
          </p>
        )}

        {/* Publisher Assignment */}
        <div className="flex items-center gap-2 pt-2 border-t border-border">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm text-muted-foreground">Assign to:</span>
          <div className="flex-1 max-w-48">
            <DocumentPublisherSelect
              publisherId={section.publisherId}
              onPublisherChange={(publisherId) => onPublisherChange(section.id, publisherId)}
            />
          </div>
        </div>

        <SectionEditHistory sectionId={section.id} />
      </div>

      {/* LinkedIn Publish Modal */}
      {assignedPublisher && (
        <LinkedInPublishModal
          isOpen={showLinkedInModal}
          onClose={() => setShowLinkedInModal(false)}
          post={postForPublish}
          publisherId={assignedPublisher.id}
          isPublisherConnected={isPublisherConnected}
          onPublishSuccess={handlePublishSuccess}
          onConnectLinkedIn={handleConnectLinkedIn}
        />
      )}
    </>
  );
}
