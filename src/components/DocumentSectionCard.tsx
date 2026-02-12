import { useState, useRef, useEffect } from 'react';
import { Check, Trash2, User, Linkedin } from 'lucide-react';
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

interface DocumentSectionCardProps {
  section: DocumentSection;
  onUpdate: (id: string, content: string) => void;
  onDelete: (id: string) => void;
  onApprove: (id: string) => void;
  onPublisherChange: (id: string, publisherId: string | null) => void;
}

export function DocumentSectionCard({ 
  section, 
  onUpdate, 
  onDelete,
  onApprove,
  onPublisherChange
}: DocumentSectionCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editContent, setEditContent] = useState(section.content);
  const [showLinkedInModal, setShowLinkedInModal] = useState(false);
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
