import { useState, useEffect } from 'react';
import { Plus, Shuffle, Sparkles, Loader2 } from 'lucide-react';
import { Document } from '@/types/document';
import { DocumentSection } from '@/hooks/useDocuments';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { usePublishers } from '@/hooks/usePublishers';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { SplitPostCard } from './SplitPostCard';

interface ParsedPost {
  content: string;
  publisherId?: string;
  scheduledDate?: string;
}

interface DocumentSplitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
  sections: DocumentSection[];
  onSave: (posts: Array<{
    content: string;
    publisherName: string;
    publisherRole: string;
    linkedinUrl: string;
    scheduledDate: string;
    documentId: string;
  }>) => void;
}

export function DocumentSplitModal({ open, onOpenChange, document, sections, onSave }: DocumentSplitModalProps) {
  const { publishers } = usePublishers();
  const [parsedPosts, setParsedPosts] = useState<ParsedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);

  // Use document upload date as default scheduled date
  const documentUploadDate = document?.createdAt 
    ? format(new Date(document.createdAt), 'yyyy-MM-dd')
    : format(new Date(), 'yyyy-MM-dd');

  // Use sections (parsed posts from document_sections table) as the source
  useEffect(() => {
    if (open && sections.length > 0) {
      // Use approved sections, or all sections if none approved
      const approvedSections = sections.filter(s => s.status === 'approved');
      const sectionsToUse = approvedSections.length > 0 ? approvedSections : sections;
      
      setParsedPosts(sectionsToUse.map(s => ({
        content: s.content,
        scheduledDate: documentUploadDate,
      })));
    } else if (open && sections.length === 0) {
      setParsedPosts([]);
    }
  }, [open, sections, documentUploadDate]);

  const updatePost = (index: number, field: keyof ParsedPost, value: string) => {
    setParsedPosts(prev => prev.map((p, i) => 
      i === index ? { ...p, [field]: value } : p
    ));
  };

  const removePost = (index: number) => {
    setParsedPosts(prev => prev.filter((_, i) => i !== index));
  };

  const addEmptyPost = () => {
    setParsedPosts(prev => [...prev, {
      content: '',
      scheduledDate: documentUploadDate,
    }]);
  };

  const randomizePublishers = () => {
    if (publishers.length === 0) return;
    
    setParsedPosts(prev => prev.map(post => ({
      ...post,
      publisherId: publishers[Math.floor(Math.random() * publishers.length)].id,
    })));
  };

  const handleAISplit = async () => {
    if (!document) return;
    
    // Use sections content for AI splitting if available
    const contentToSplit = sections.length > 0 
      ? sections.map(s => s.content).join('\n\n---\n\n')
      : document.content;
    
    setIsSplitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('split-document', {
        body: { content: contentToSplit, title: document.title }
      });

      if (error) {
        console.error('Error splitting document:', error);
        toast.error('Failed to split document with AI');
        return;
      }

      if (data?.success && data.posts?.length > 0) {
        setParsedPosts(data.posts.map((content: string) => ({
          content,
          scheduledDate: documentUploadDate,
        })));
        toast.success(`Split into ${data.posts.length} posts`);
      } else {
        toast.error(data?.error || 'No posts generated');
      }
    } catch (err) {
      console.error('Error calling split function:', err);
      toast.error('Failed to split document');
    } finally {
      setIsSplitting(false);
    }
  };

  const handleSave = () => {
    if (!document) return;

    const postsToCreate = parsedPosts
      .filter(p => p.content.trim() && p.publisherId)
      .map(post => {
        const publisher = publishers.find(p => p.id === post.publisherId);
        return {
          content: post.content,
          publisherName: publisher?.name || '',
          publisherRole: publisher?.role || '',
          linkedinUrl: publisher?.linkedin_url || '',
          scheduledDate: post.scheduledDate || format(new Date(), 'yyyy-MM-dd'),
          documentId: document.id,
        };
      });

    if (postsToCreate.length === 0) {
      return;
    }

    setIsLoading(true);
    onSave(postsToCreate);
    setIsLoading(false);
    onOpenChange(false);
  };

  const isValid = parsedPosts.some(p => p.content.trim() && p.publisherId);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            Split Document to Posts
            {document && (
              <span className="text-sm font-normal text-muted-foreground">
                — {document.title}
              </span>
            )}
          </DialogTitle>
          {document && (
            <p className="text-xs text-muted-foreground">
              Uploaded: {format(new Date(document.createdAt), 'MMM d, yyyy')}
            </p>
          )}
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 py-4">
          <div className="flex justify-between items-center">
            <Button 
              variant="outline" 
              onClick={handleAISplit}
              disabled={isSplitting}
              className="gap-2"
            >
              {isSplitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Sparkles className="h-4 w-4" />
              )}
              {isSplitting ? 'Splitting...' : 'AI Split to Posts'}
            </Button>
            
            {parsedPosts.length > 0 && publishers.length > 0 && (
              <Button 
                variant="outline" 
                size="sm" 
                onClick={randomizePublishers}
                className="gap-2"
              >
                <Shuffle className="h-4 w-4" />
                Randomize Publishers
              </Button>
            )}
          </div>
          
          {parsedPosts.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              No posts found. The document should contain "Post 1", "Post 2", etc. markers.
              <Button variant="outline" className="mt-4" onClick={addEmptyPost}>
                <Plus className="h-4 w-4 mr-2" />
                Add Post Manually
              </Button>
            </div>
          ) : (
            <>
              {parsedPosts.map((post, index) => (
                <SplitPostCard
                  key={index}
                  index={index}
                  content={post.content}
                  publisherId={post.publisherId}
                  scheduledDate={post.scheduledDate}
                  publishers={publishers}
                  onUpdateContent={(value) => updatePost(index, 'content', value)}
                  onUpdatePublisher={(value) => updatePost(index, 'publisherId', value)}
                  onUpdateDate={(value) => updatePost(index, 'scheduledDate', value)}
                  onRemove={() => removePost(index)}
                />
              ))}

              <Button variant="outline" className="w-full" onClick={addEmptyPost}>
                <Plus className="h-4 w-4 mr-2" />
                Add Another Post
              </Button>
            </>
          )}
        </div>

        <div className="flex justify-end gap-2 pt-4 border-t border-border">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={!isValid || isLoading}
          >
            Create {parsedPosts.filter(p => p.content.trim() && p.publisherId).length} Post(s)
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
