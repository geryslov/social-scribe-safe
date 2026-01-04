import { useState, useEffect } from 'react';
import { Calendar, User, Plus, Trash2, Shuffle, Sparkles, Loader2 } from 'lucide-react';
import { Document } from '@/types/document';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { usePublishers } from '@/hooks/usePublishers';
import { format } from 'date-fns';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

interface ParsedPost {
  content: string;
  publisherId?: string;
  scheduledDate?: string;
}

interface DocumentSplitModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  document: Document | null;
  onSave: (posts: Array<{
    content: string;
    publisherName: string;
    publisherRole: string;
    linkedinUrl: string;
    scheduledDate: string;
    documentId: string;
  }>) => void;
}

function isExcludedSection(line: string): boolean {
  const excludedPatterns = [
    /^data\s*sources?/i,
    /^appendix/i,
    /^references?/i,
    /^sources?:/i,
  ];
  return excludedPatterns.some(pattern => pattern.test(line.trim()));
}

function parsePostsFromContent(content: string): ParsedPost[] {
  const posts: ParsedPost[] = [];
  const lines = content.split('\n');
  let currentPost: string[] = [];
  let foundFirstPost = false;
  let inExcludedSection = false;

  for (const line of lines) {
    const isPostMarker = /^Post\s*\d+/i.test(line.trim());
    
    // Check if we're entering an excluded section
    if (isExcludedSection(line)) {
      inExcludedSection = true;
      continue;
    }
    
    if (isPostMarker) {
      // Reset excluded section flag when we find a new post
      inExcludedSection = false;
      
      if (currentPost.length > 0 && foundFirstPost) {
        posts.push({ content: currentPost.join('\n').trim() });
      }
      currentPost = [];
      foundFirstPost = true;
    } else if (foundFirstPost && !inExcludedSection) {
      currentPost.push(line);
    }
  }

  if (currentPost.length > 0 && foundFirstPost) {
    posts.push({ content: currentPost.join('\n').trim() });
  }

  // If no Post markers found, treat entire content as one post (excluding sections)
  if (posts.length === 0 && content.trim()) {
    const filteredLines: string[] = [];
    let excluded = false;
    for (const line of lines) {
      if (isExcludedSection(line)) {
        excluded = true;
        continue;
      }
      if (!excluded) {
        filteredLines.push(line);
      }
    }
    const filteredContent = filteredLines.join('\n').trim();
    if (filteredContent) {
      posts.push({ content: filteredContent });
    }
  }

  return posts;
}

export function DocumentSplitModal({ open, onOpenChange, document, onSave }: DocumentSplitModalProps) {
  const { publishers } = usePublishers();
  const [parsedPosts, setParsedPosts] = useState<ParsedPost[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSplitting, setIsSplitting] = useState(false);

  // Use document upload date as default scheduled date
  const documentUploadDate = document?.createdAt 
    ? format(new Date(document.createdAt), 'yyyy-MM-dd')
    : format(new Date(), 'yyyy-MM-dd');

  useEffect(() => {
    if (document && open) {
      const posts = parsePostsFromContent(document.content);
      setParsedPosts(posts.map(p => ({
        ...p,
        scheduledDate: documentUploadDate,
      })));
    }
  }, [document, open, documentUploadDate]);

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
    
    setIsSplitting(true);
    try {
      const { data, error } = await supabase.functions.invoke('split-document', {
        body: { content: document.content, title: document.title }
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
                <div 
                  key={index} 
                  className="border border-border rounded-lg p-4 space-y-3 bg-card"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium text-muted-foreground">
                      Post {index + 1}
                    </span>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-destructive"
                      onClick={() => removePost(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <Textarea
                    value={post.content}
                    onChange={(e) => updatePost(index, 'content', e.target.value)}
                    placeholder="Post content..."
                    className="min-h-24 resize-none"
                  />

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                        <User className="h-3 w-3" />
                        Publisher
                      </label>
                      <Select
                        value={post.publisherId || ''}
                        onValueChange={(value) => updatePost(index, 'publisherId', value)}
                      >
                        <SelectTrigger className={cn(!post.publisherId && 'text-muted-foreground')}>
                          <SelectValue placeholder="Select publisher..." />
                        </SelectTrigger>
                        <SelectContent>
                          {publishers.map(publisher => (
                            <SelectItem key={publisher.id} value={publisher.id}>
                              {publisher.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>

                    <div>
                      <label className="text-xs text-muted-foreground mb-1.5 flex items-center gap-1">
                        <Calendar className="h-3 w-3" />
                        Scheduled Date
                      </label>
                      <Input
                        type="date"
                        value={post.scheduledDate || ''}
                        onChange={(e) => updatePost(index, 'scheduledDate', e.target.value)}
                      />
                    </div>
                  </div>
                </div>
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
