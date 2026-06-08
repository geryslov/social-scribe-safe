import { useState } from 'react';
import { IntelligenceItem } from '@/hooks/useIntelligence';
import { Publisher } from '@/hooks/usePublishers';
import { useDocuments } from '@/hooks/useDocuments';
import { useWorkspace } from '@/hooks/useWorkspace';
import { supabase } from '@/integrations/supabase/client';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { useNavigate } from 'react-router-dom';

interface CreateDocumentFromFeedProps {
  items: IntelligenceItem[];
  publisher: Publisher;
  onClose: () => void;
  onCreated: (documentId: string) => void;
}

export function CreateDocumentFromFeed({ items, publisher, onClose, onCreated }: CreateDocumentFromFeedProps) {
  const { createDocument } = useDocuments();
  const navigate = useNavigate();
  const [topic, setTopic] = useState('');
  const [guidance, setGuidance] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);

  // Build reference content and URLs from selected items
  const websiteUrls = items.map((i) => i.url);
  const referenceContent = items
    .map((i) => {
      const parts = [`[${i.source_type.toUpperCase()}] ${i.title}`];
      if (i.content_snippet) parts.push(i.content_snippet);
      parts.push(`URL: ${i.url}`);
      if (i.upvotes > 0) parts.push(`Upvotes: ${i.upvotes}`);
      if (i.points > 0) parts.push(`Points: ${i.points}`);
      if (i.comments_count > 0) parts.push(`Comments: ${i.comments_count}`);
      return parts.join('\n');
    })
    .join('\n\n---\n\n');

  const handleGenerate = async () => {
    if (!topic.trim()) {
      toast.error('Enter a topic');
      return;
    }

    setIsGenerating(true);
    try {
      // Call create-document Edge Function with intelligence items as reference
      const { data, error } = await supabase.functions.invoke('create-document', {
        body: {
          topic: topic.trim(),
          guidance: guidance.trim() || undefined,
          websiteUrls: websiteUrls.length > 0 ? websiteUrls : undefined,
          urlStrategy: websiteUrls.length > 1 ? 'cross' : 'cross',
          referenceContent,
          publisherProfiles: [{ name: publisher.name, linkedinUrl: publisher.linkedin_url || '' }],
        },
      });

      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Generation failed');

      // Save as document
      const doc = await createDocument.mutateAsync({
        title: data.title || topic.trim(),
        content: data.content,
      });

      onCreated(doc.id);
      toast.success('Document created from intelligence feed');
      navigate(`/documents/${doc.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to generate document';
      toast.error(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveRaw = async () => {
    try {
      const content = items
        .map((i) => `## ${i.title}\n\n${i.content_snippet || ''}\n\nSource: ${i.url}`)
        .join('\n\n---\n\n');

      const doc = await createDocument.mutateAsync({
        title: topic.trim() || `Research: ${publisher.name}`,
        content,
      });

      onCreated(doc.id);
      toast.success('Raw research saved as document');
      navigate(`/documents/${doc.id}`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to save document';
      toast.error(message);
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Create Document from Feed</DialogTitle>
          <DialogDescription>
            {items.length} item{items.length !== 1 ? 's' : ''} selected as reference material
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          {/* Selected items summary */}
          <div className="flex flex-wrap gap-1">
            {items.slice(0, 5).map((item) => (
              <Badge key={item.id} variant="secondary" className="text-[10px] max-w-[200px] truncate">
                {item.title}
              </Badge>
            ))}
            {items.length > 5 && (
              <Badge variant="outline" className="text-[10px]">
                +{items.length - 5} more
              </Badge>
            )}
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Topic</label>
            <Input
              value={topic}
              onChange={(e) => setTopic(e.target.value)}
              placeholder="What should the post be about?"
            />
          </div>

          <div>
            <label className="text-sm font-medium mb-1 block">Guidance (optional)</label>
            <Textarea
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
              placeholder="Any specific angle, tone, or key points to hit?"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={handleSaveRaw} disabled={isGenerating}>
            Save Raw
          </Button>
          <Button onClick={handleGenerate} disabled={isGenerating}>
            {isGenerating ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              'Generate with AI'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
