import { useState, useCallback, useRef } from 'react';
import { Upload, FileText, X, Plus, Sparkles, Loader2, Globe, Paperclip } from 'lucide-react';
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
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; content: string; fileName?: string; fileUrl?: string }) => void;
  showAiCreate?: boolean;
}

const LENGTH_OPTIONS = [
  { value: 'super_short', label: 'Super Short', description: '< 100 words' },
  { value: 'short', label: 'Short', description: '100-200 words' },
  { value: 'medium', label: 'Medium', description: '200-400 words' },
  { value: 'long', label: 'Long', description: '400-700 words' },
] as const;

export function DocumentUploadModal({ open, onOpenChange, onSave, showAiCreate }: DocumentUploadModalProps) {
  const [mode, setMode] = useState<'upload' | 'create' | 'ai'>('upload');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [fileName, setFileName] = useState<string | null>(null);
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [aiTopic, setAiTopic] = useState('');
  const [aiGuidance, setAiGuidance] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  
  // New AI options
  const [aiWebsiteUrl, setAiWebsiteUrl] = useState('');
  const [aiReferenceFile, setAiReferenceFile] = useState<File | null>(null);
  const [aiReferenceContent, setAiReferenceContent] = useState('');
  const [aiLength, setAiLength] = useState('medium');
  const [isParsingRef, setIsParsingRef] = useState(false);
  const refFileInputRef = useRef<HTMLInputElement>(null);

  const resetForm = () => {
    setMode('upload');
    setTitle('');
    setContent('');
    setFileName(null);
    setFileUrl(null);
    setAiTopic('');
    setAiGuidance('');
    setAiWebsiteUrl('');
    setAiReferenceFile(null);
    setAiReferenceContent('');
    setAiLength('medium');
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
      setTitle(file.name.replace(/\.[^/.]+$/, ''));

      if (file.name.endsWith('.txt')) {
        const text = await file.text();
        setContent(text);
      } else if (file.name.endsWith('.docx') || file.name.endsWith('.csv')) {
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

  const handleReferenceFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.endsWith('.pdf')) {
      toast.error('Only PDF files are supported for reference documents');
      return;
    }

    setAiReferenceFile(file);
    setIsParsingRef(true);

    try {
      const formData = new FormData();
      formData.append('file', file);

      const { data, error } = await supabase.functions.invoke('parse-document', {
        body: formData,
      });

      if (error) throw error;
      setAiReferenceContent(data.content || '');
      toast.success(`Reference document loaded: ${file.name}`);
    } catch (error) {
      console.error('Error parsing reference PDF:', error);
      toast.error('Failed to parse PDF');
      setAiReferenceFile(null);
      setAiReferenceContent('');
    } finally {
      setIsParsingRef(false);
    }
  };

  const handleGenerate = async () => {
    if (!aiTopic.trim()) {
      toast.error('Please enter a topic');
      return;
    }

    setIsGenerating(true);
    try {
      const { data, error } = await supabase.functions.invoke('create-document', {
        body: {
          topic: aiTopic.trim(),
          guidance: aiGuidance.trim() || undefined,
          websiteUrl: aiWebsiteUrl.trim() || undefined,
          referenceContent: aiReferenceContent || undefined,
          length: aiLength,
        },
      });

      if (error) {
        console.error('Error generating document:', error);
        const errorMsg = error?.message || error?.context?.json?.error || 'Failed to generate document';
        toast.error(errorMsg);
        return;
      }

      if (data?.success) {
        setTitle(data.title || aiTopic.trim());
        setContent(data.content || '');
        toast.success('Document generated! Review and edit before saving.');
      } else {
        toast.error(data?.error || 'Failed to generate document');
      }
    } catch (err) {
      console.error('Error calling create-document:', err);
      toast.error('Failed to generate document');
    } finally {
      setIsGenerating(false);
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

  const showContentEditor = mode === 'create' || (mode === 'ai' && content) || fileName;

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
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
              variant={mode === 'ai' ? 'default' : 'outline'}
              size="sm"
              onClick={() => setMode('ai')}
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

        {mode === 'ai' && !content && (
          <div className="space-y-4">
            <div>
              <label className="text-sm font-medium mb-1.5 block">Topic / Brief</label>
              <Input
                value={aiTopic}
                onChange={(e) => setAiTopic(e.target.value)}
                placeholder="e.g., Benefits of remote work for engineering teams"
                disabled={isGenerating}
              />
            </div>

            <div>
              <label className="text-sm font-medium mb-1.5 block">
                Additional Guidance <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Textarea
                value={aiGuidance}
                onChange={(e) => setAiGuidance(e.target.value)}
                placeholder="e.g., Focus on productivity metrics, target VP-level audience, include data about hybrid models..."
                className="min-h-20 resize-none"
                disabled={isGenerating}
              />
            </div>

            {/* Post Length */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">Post Length</label>
              <Select value={aiLength} onValueChange={setAiLength} disabled={isGenerating}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {LENGTH_OPTIONS.map(opt => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label} <span className="text-muted-foreground ml-1">({opt.description})</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Website URL */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                <Globe className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                Reference Website <span className="text-muted-foreground font-normal">(optional)</span>
              </label>
              <Input
                value={aiWebsiteUrl}
                onChange={(e) => setAiWebsiteUrl(e.target.value)}
                placeholder="https://yourcompany.com/about"
                disabled={isGenerating}
                type="url"
              />
              <p className="text-xs text-muted-foreground mt-1">
                The AI will read this page and use its content as source material
              </p>
            </div>

            {/* Reference PDF */}
            <div>
              <label className="text-sm font-medium mb-1.5 block">
                <Paperclip className="h-3.5 w-3.5 inline mr-1 -mt-0.5" />
                Reference Document <span className="text-muted-foreground font-normal">(optional, PDF)</span>
              </label>
              <input
                ref={refFileInputRef}
                type="file"
                className="hidden"
                accept=".pdf"
                onChange={handleReferenceFileSelect}
                disabled={isGenerating}
              />
              {aiReferenceFile ? (
                <div className="flex items-center gap-2 p-2.5 bg-secondary/50 rounded-lg">
                  <FileText className="h-4 w-4 text-primary shrink-0" />
                  <span className="text-sm flex-1 truncate">{aiReferenceFile.name}</span>
                  {isParsingRef && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6"
                    onClick={() => {
                      setAiReferenceFile(null);
                      setAiReferenceContent('');
                    }}
                    disabled={isGenerating}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => refFileInputRef.current?.click()}
                  disabled={isGenerating}
                >
                  <Paperclip className="h-4 w-4 mr-2" />
                  Attach PDF
                </Button>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                The AI will extract and use this document's content as source material
              </p>
            </div>

            <Button
              onClick={handleGenerate}
              disabled={isGenerating || isParsingRef || !aiTopic.trim()}
              className="w-full"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate Document
                </>
              )}
            </Button>
          </div>
        )}

        {showContentEditor && (
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
            disabled={isLoading || isGenerating || !title.trim() || !content.trim()}
          >
            {isLoading ? 'Processing...' : 'Save Document'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}