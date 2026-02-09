import { useState, useCallback } from 'react';
import { Upload, FileText, X, Plus, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

const CLAUDE_PROJECT_URL = 'https://claude.ai/project/019a57fa-5c62-7625-a3a4-9a7eb3150763';

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; content: string; fileName?: string; fileUrl?: string }) => void;
  showAiCreate?: boolean;
}

export function DocumentUploadModal({ open, onOpenChange, onSave, showAiCreate }: DocumentUploadModalProps) {
  const [mode, setMode] = useState<'upload' | 'create'>('upload');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const resetForm = () => {
    setMode('upload');
    setTitle('');
    setContent('');
    setFileName(null);
    setFileUrl(null);
  };

  const handleClose = () => {
    resetForm();
    onOpenChange(false);
  };

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  }, []);

  const processFile = async (file: File) => {
    setIsLoading(true);
    
    try {
      // Upload file to storage
      const storagePath = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file);
      
      if (uploadError) throw uploadError;
      
      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);
      
      setFileName(file.name);
      setFileUrl(urlData.publicUrl);
      setTitle(file.name.replace(/\.[^/.]+$/, '')); // Remove extension for title

      // Parse content based on file type
      if (file.name.endsWith('.txt')) {
        const text = await file.text();
        setContent(text);
      } else if (file.name.endsWith('.docx') || file.name.endsWith('.csv')) {
        // Use parse-document edge function
        const formData = new FormData();
        formData.append('file', file);

        const { data, error } = await supabase.functions.invoke('parse-document', {
          body: formData,
        });

        if (error) throw error;
        setContent(data.content || '');
      } else {
        const text = await file.text();
        setContent(text);
      }
    } catch (error) {
      console.error('Error processing file:', error);
      toast.error('Failed to process file');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    
    const file = e.dataTransfer.files[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      await processFile(file);
    }
  };

  const handleSave = () => {
    if (!title.trim()) {
      toast.error('Please enter a title');
      return;
    }
    if (!content.trim()) {
      toast.error('Please enter content');
      return;
    }

    onSave({
      title: title.trim(),
      content: content.trim(),
      fileName: fileName || undefined,
      fileUrl: fileUrl || undefined,
    });
    handleClose();
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add Document</DialogTitle>
        </DialogHeader>

        {/* Mode Toggle */}
        <div className="flex gap-2 mb-4">
          <Button
            variant={mode === 'upload' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('upload')}
          >
            <Upload className="h-4 w-4 mr-2" />
            Upload File
          </Button>
          <Button
            variant={mode === 'create' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setMode('create')}
          >
            <Plus className="h-4 w-4 mr-2" />
            Create New
          </Button>
          {showAiCreate && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => window.open(CLAUDE_PROJECT_URL, '_blank')}
            >
              <Sparkles className="h-4 w-4 mr-2" />
              Create with AI
            </Button>
          )}
        </div>

        {mode === 'upload' && !fileName && (
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            className={cn(
              "border-2 border-dashed rounded-xl p-12 text-center transition-all",
              isDragging 
                ? "border-primary bg-primary/5" 
                : "border-border hover:border-primary/50"
            )}
          >
            <input
              type="file"
              id="file-upload"
              className="hidden"
              accept=".txt,.docx,.csv"
              onChange={handleFileInput}
            />
            <label htmlFor="file-upload" className="cursor-pointer">
              <div className="flex flex-col items-center gap-3">
                <div className="w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                  <Upload className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <p className="font-medium text-foreground">
                    Drop your file here or click to browse
                  </p>
                  <p className="text-sm text-muted-foreground mt-1">
                    Supports .txt, .docx, and .csv files
                  </p>
                </div>
              </div>
            </label>
          </div>
        )}

        {(mode === 'create' || fileName) && (
          <div className="space-y-4">
            {fileName && (
              <div className="flex items-center gap-2 p-3 bg-secondary/50 rounded-lg">
                <FileText className="h-5 w-5 text-primary" />
                <span className="text-sm flex-1 truncate">{fileName}</span>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => {
                    setFileName(null);
                    setFileUrl(null);
                    setContent('');
                  }}
                >
                  <X className="h-4 w-4" />
                </Button>
              </div>
            )}

            <div>
              <label className="text-sm font-medium mb-1.5 block">Title</label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Document title..."
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">Content</label>
              <Textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                placeholder="Document content..."
                className="min-h-48 resize-none"
              />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 pt-4">
          <Button variant="outline" onClick={handleClose}>
            Cancel
          </Button>
          <Button 
            onClick={handleSave} 
            disabled={isLoading || !title.trim() || !content.trim()}
          >
            {isLoading ? 'Processing...' : 'Save Document'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
