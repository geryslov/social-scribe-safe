import { useState, useRef } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Upload, FileText, X, Check, CalendarIcon, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { supabase } from '@/integrations/supabase/client';

interface ParsedPost {
  id: number;
  content: string;
  assignedPublisher: string;
  scheduledDate: Date;
}

interface Publisher {
  name: string;
  role: string;
  linkedinUrl: string;
}

interface BulkUploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (posts: { content: string; publisherName: string; scheduledDate: string }[]) => void;
  existingPublishers: Publisher[];
}

function parsePostsFromContent(content: string): ParsedPost[] {
  // Match patterns like "Post 1", "Post 2", "post 1", "POST 1", etc.
  const postPattern = /post\s*(\d+)/gi;
  const matches = [...content.matchAll(postPattern)];
  const today = new Date();
  
  if (matches.length === 0) {
    // If no post markers found, treat entire content as one post
    return [{ id: 1, content: content.trim(), assignedPublisher: '', scheduledDate: today }];
  }

  const posts: ParsedPost[] = [];
  
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i];
    const postNumber = parseInt(match[1]);
    const startIndex = match.index! + match[0].length;
    const endIndex = i < matches.length - 1 ? matches[i + 1].index! : content.length;
    
    // Extract content between this post marker and the next (or end)
    let postContent = content.slice(startIndex, endIndex).trim();
    
    // Remove leading colon or dash if present
    postContent = postContent.replace(/^[:\-–—]\s*/, '').trim();
    
    if (postContent) {
      posts.push({
        id: postNumber,
        content: postContent,
        assignedPublisher: '',
        scheduledDate: today,
      });
    }
  }

  return posts;
}

export function BulkUploadModal({ isOpen, onClose, onSave, existingPublishers }: BulkUploadModalProps) {
  const [parsedPosts, setParsedPosts] = useState<ParsedPost[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processContent = (content: string, name: string) => {
    const posts = parsePostsFromContent(content);
    setParsedPosts(posts);
    setFileName(name);
    
    if (posts.length === 0) {
      toast.error('No posts found in the file');
    } else {
      toast.success(`Found ${posts.length} post${posts.length !== 1 ? 's' : ''}`);
    }
  };

  const handleFileRead = async (file: File) => {
    const fileName = file.name.toLowerCase();
    const needsServerParsing = fileName.endsWith('.docx') || fileName.endsWith('.csv');
    
    if (needsServerParsing) {
      setIsLoading(true);
      try {
        const formData = new FormData();
        formData.append('file', file);
        
        const { data, error } = await supabase.functions.invoke('parse-document', {
          body: formData,
        });
        
        if (error) throw error;
        
        if (data.success && data.content) {
          processContent(data.content, file.name);
        } else {
          toast.error(data.error || 'Failed to parse file');
        }
      } catch (error) {
        console.error('Error parsing file:', error);
        toast.error('Failed to parse file. Please try a .txt file instead.');
      } finally {
        setIsLoading(false);
      }
    } else {
      // Handle text files locally
      const reader = new FileReader();
      reader.onload = (e) => {
        const content = e.target?.result as string;
        processContent(content, file.name);
      };
      reader.onerror = () => {
        toast.error('Failed to read file');
      };
      reader.readAsText(file);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileRead(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileRead(file);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handlePublisherAssign = (postId: number, publisherName: string) => {
    setParsedPosts(posts =>
      posts.map(post =>
        post.id === postId ? { ...post, assignedPublisher: publisherName } : post
      )
    );
  };

  const handleDateChange = (postId: number, date: Date | undefined) => {
    if (date) {
      setParsedPosts(posts =>
        posts.map(post =>
          post.id === postId ? { ...post, scheduledDate: date } : post
        )
      );
    }
  };

  const handleSave = () => {
    const unassigned = parsedPosts.filter(p => !p.assignedPublisher);
    if (unassigned.length > 0) {
      toast.error(`Please assign publishers to all posts (${unassigned.length} unassigned)`);
      return;
    }

    const postsToCreate = parsedPosts.map(post => ({
      content: post.content,
      publisherName: post.assignedPublisher,
      scheduledDate: format(post.scheduledDate, 'yyyy-MM-dd'),
    }));

    onSave(postsToCreate);
    handleClose();
  };

  const handleClose = () => {
    setParsedPosts([]);
    setFileName('');
    onClose();
  };

  const allAssigned = parsedPosts.length > 0 && parsedPosts.every(p => p.assignedPublisher);

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="max-w-3xl max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Upload className="h-5 w-5" />
            Bulk Upload Posts
          </DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto space-y-4 pr-2">
          {/* File Upload Area */}
          {parsedPosts.length === 0 && !isLoading ? (
            <div
              className={cn(
                "border-2 border-dashed rounded-xl p-8 text-center transition-colors cursor-pointer",
                isDragging ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"
              )}
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onClick={() => fileInputRef.current?.click()}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".txt,.md,.docx,.csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <FileText className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <p className="text-lg font-medium mb-2">Drop your file here or click to browse</p>
              <p className="text-sm text-muted-foreground">
                Supports .txt, .md, .docx, .csv files. Posts should be marked as "Post 1", "Post 2", etc.
              </p>
            </div>
          ) : isLoading ? (
            <div className="border-2 border-dashed rounded-xl p-8 text-center border-primary/30 bg-primary/5">
              <Loader2 className="h-12 w-12 mx-auto text-primary mb-4 animate-spin" />
              <p className="text-lg font-medium mb-2">Parsing document...</p>
              <p className="text-sm text-muted-foreground">
                This may take a moment for large files
              </p>
            </div>
          ) : (
            <>
              {/* File Info */}
              <div className="flex items-center justify-between bg-secondary/50 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <FileText className="h-4 w-4 text-primary" />
                  <span className="text-sm font-medium">{fileName}</span>
                  <span className="text-xs text-muted-foreground">
                    ({parsedPosts.length} post{parsedPosts.length !== 1 ? 's' : ''})
                  </span>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setParsedPosts([]);
                    setFileName('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>

              {/* Posts List */}
              <div className="space-y-4">
                {parsedPosts.map((post) => (
                  <div
                    key={post.id}
                    className={cn(
                      "border rounded-xl p-4 space-y-3 transition-colors",
                      post.assignedPublisher ? "border-success/30 bg-success/5" : "border-border"
                    )}
                  >
                    <div className="flex items-start justify-between gap-4 flex-wrap">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-semibold text-primary">Post {post.id}</span>
                        {post.assignedPublisher && (
                          <Check className="h-4 w-4 text-success" />
                        )}
                      </div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Popover>
                          <PopoverTrigger asChild>
                            <Button variant="outline" size="sm" className="w-36 justify-start text-left font-normal">
                              <CalendarIcon className="mr-2 h-4 w-4" />
                              {format(post.scheduledDate, 'MMM d, yyyy')}
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={post.scheduledDate}
                              onSelect={(date) => handleDateChange(post.id, date)}
                              initialFocus
                              className="p-3 pointer-events-auto"
                            />
                          </PopoverContent>
                        </Popover>
                        <Select
                          value={post.assignedPublisher}
                          onValueChange={(value) => handlePublisherAssign(post.id, value)}
                        >
                          <SelectTrigger className="w-48">
                            <SelectValue placeholder="Assign publisher" />
                          </SelectTrigger>
                          <SelectContent>
                            {existingPublishers.map((publisher) => (
                              <SelectItem key={publisher.name} value={publisher.name}>
                                {publisher.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                    <p className="text-sm text-foreground/80 whitespace-pre-wrap line-clamp-4">
                      {post.content}
                    </p>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        {parsedPosts.length > 0 && (
          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="outline" onClick={handleClose}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={!allAssigned}
              className="gradient-bg"
            >
              Create {parsedPosts.length} Post{parsedPosts.length !== 1 ? 's' : ''}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
