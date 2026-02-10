import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, X, Plus, Sparkles, Loader2, Globe, Paperclip, Mic, PenLine, Wand2, MessageSquare, Flame, Zap, BookOpen, User, Shield, Megaphone, ChevronDown, ChevronUp } from 'lucide-react';
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

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; content: string; fileName?: string; fileUrl?: string }) => void;
  showAiCreate?: boolean;
}

const LENGTH_OPTIONS = [
  { value: 'super_short', label: 'Super Short', description: '< 100 words', icon: '⚡' },
  { value: 'short', label: 'Short', description: '100-200', icon: '📝' },
  { value: 'medium', label: 'Medium', description: '200-400', icon: '📄' },
  { value: 'long', label: 'Long', description: '400-700', icon: '📚' },
] as const;

const POST_COUNT_OPTIONS = [
  { value: 'single', label: 'Single', description: '1 post', icon: '1' },
  { value: '2-4', label: '2–4', description: 'Small batch', icon: '3' },
  { value: '4-6', label: '4–6', description: 'Full series', icon: '5' },
] as const;

const TONE_OPTIONS = [
  { value: 'default', label: 'Default', description: 'Standard thought leadership', icon: PenLine, color: 'text-muted-foreground' },
  { value: 'stream_of_consciousness', label: 'Stream of Thought', description: 'Raw, unfiltered', icon: Mic, color: 'text-purple-500' },
  { value: 'typo_prone_human', label: 'Human & Raw', description: 'Casual real-person', icon: User, color: 'text-amber-500' },
  { value: 'uneven_storyteller', label: 'Storyteller', description: 'Narrative pacing', icon: BookOpen, color: 'text-emerald-500' },
  { value: 'passionate_amateur', label: 'Passionate', description: 'Energetic & excited', icon: Zap, color: 'text-yellow-500' },
  { value: 'professional', label: 'Professional', description: 'Corporate authority', icon: Shield, color: 'text-blue-500' },
  { value: 'conversational', label: 'Conversational', description: 'Friendly & warm', icon: MessageSquare, color: 'text-teal-500' },
  { value: 'aggressive', label: 'Aggressive', description: 'Bold & direct', icon: Flame, color: 'text-red-500' },
  { value: 'provocative', label: 'Provocative', description: 'Debate-starter', icon: Megaphone, color: 'text-orange-500' },
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
  
  const [aiWebsiteUrl, setAiWebsiteUrl] = useState('');
  const [aiReferenceFile, setAiReferenceFile] = useState<File | null>(null);
  const [aiReferenceContent, setAiReferenceContent] = useState('');
  const [aiLength, setAiLength] = useState('medium');
  const [aiPostCount, setAiPostCount] = useState('4-6');
  const [aiTone, setAiTone] = useState('default');
  const [isParsingRef, setIsParsingRef] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

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
    setAiPostCount('4-6');
    setAiTone('default');
    setShowAdvanced(false);
  };

  const handleClose = () => {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setIsGenerating(false);
    setIsLoading(false);
    setIsParsingRef(false);
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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const { data, error } = await supabase.functions.invoke('create-document', {
        body: {
          topic: aiTopic.trim(),
          guidance: aiGuidance.trim() || undefined,
          websiteUrl: aiWebsiteUrl.trim() || undefined,
          referenceContent: aiReferenceContent || undefined,
          length: aiLength,
          postCount: aiPostCount,
          tone: aiTone !== 'default' ? aiTone : undefined,
        },
      });
      if (controller.signal.aborted) return;
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
    } catch (err: any) {
      if (err?.name === 'AbortError' || controller.signal.aborted) return;
      console.error('Error calling create-document:', err);
      toast.error('Failed to generate document');
    } finally {
      if (!controller.signal.aborted) {
        setIsGenerating(false);
      }
      abortControllerRef.current = null;
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

  const selectedTone = TONE_OPTIONS.find(t => t.value === aiTone) || TONE_OPTIONS[0];

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="px-6 pt-6 pb-0">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Add Document</DialogTitle>
          </DialogHeader>
        </div>

        {/* Mode Selector - Card Style */}
        <div className="px-6 pt-4">
          <div className="grid grid-cols-3 gap-3">
            {/* Upload Card */}
            <button
              onClick={() => setMode('upload')}
              className={cn(
                "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 group",
                mode === 'upload'
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200",
                mode === 'upload'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
              )}>
                <Upload className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className={cn("text-sm font-medium", mode === 'upload' ? "text-primary" : "text-foreground")}>
                  Upload
                </p>
                <p className="text-[11px] text-muted-foreground">
                  .txt, .docx, .csv
                </p>
              </div>
            </button>

            {/* Create Card */}
            <button
              onClick={() => setMode('create')}
              className={cn(
                "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 group",
                mode === 'create'
                  ? "border-primary bg-primary/5 shadow-md shadow-primary/10"
                  : "border-border hover:border-primary/40 hover:bg-muted/50"
              )}
            >
              <div className={cn(
                "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200",
                mode === 'create'
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary"
              )}>
                <PenLine className="h-5 w-5" />
              </div>
              <div className="text-center">
                <p className={cn("text-sm font-medium", mode === 'create' ? "text-primary" : "text-foreground")}>
                  Write
                </p>
                <p className="text-[11px] text-muted-foreground">
                  From scratch
                </p>
              </div>
            </button>

            {/* AI Card */}
            {showAiCreate && (
              <button
                onClick={() => setMode('ai')}
                className={cn(
                  "relative flex flex-col items-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 group",
                  mode === 'ai'
                    ? "border-accent bg-accent/5 shadow-md shadow-accent/10"
                    : "border-border hover:border-accent/40 hover:bg-muted/50"
                )}
              >
                <div className={cn(
                  "w-10 h-10 rounded-lg flex items-center justify-center transition-all duration-200",
                  mode === 'ai'
                    ? "bg-accent text-accent-foreground"
                    : "bg-muted text-muted-foreground group-hover:bg-accent/10 group-hover:text-accent"
                )}>
                  <Wand2 className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className={cn("text-sm font-medium", mode === 'ai' ? "text-accent" : "text-foreground")}>
                    AI Create
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Generate posts
                  </p>
                </div>
              </button>
            )}

            {/* If no AI, show placeholder to keep grid */}
            {!showAiCreate && (
              <div className="flex flex-col items-center gap-2 p-4 rounded-xl border-2 border-dashed border-border/50 opacity-40 cursor-not-allowed">
                <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-muted text-muted-foreground">
                  <Wand2 className="h-5 w-5" />
                </div>
                <div className="text-center">
                  <p className="text-sm font-medium text-muted-foreground">AI Create</p>
                  <p className="text-[11px] text-muted-foreground">Not available</p>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Content Area */}
        <div className="px-6 py-4 space-y-4">
          {/* Upload Mode */}
          {mode === 'upload' && !fileName && (
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={cn(
                "border-2 border-dashed rounded-xl p-10 text-center transition-all duration-300 animate-fade-in",
                isDragging
                  ? "border-primary bg-primary/5 scale-[1.02]"
                  : "border-border hover:border-primary/50 hover:bg-muted/30"
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
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300",
                    isDragging
                      ? "bg-primary text-primary-foreground scale-110"
                      : "bg-primary/10 text-primary"
                  )}>
                    <Upload className="h-7 w-7" />
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

          {/* AI Mode */}
          {mode === 'ai' && !content && (
            <div className="space-y-5 animate-fade-in">
              {/* Topic */}
              <div>
                <label className="text-sm font-medium mb-1.5 block text-foreground">
                  What should the posts be about?
                </label>
                <Input
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="e.g., Benefits of remote work for engineering teams"
                  disabled={isGenerating}
                  className="h-11"
                />
              </div>

              {/* Guidance */}
              <div>
                <label className="text-sm font-medium mb-1.5 block text-foreground">
                  Additional guidance <span className="text-muted-foreground font-normal">(optional)</span>
                </label>
                <Textarea
                  value={aiGuidance}
                  onChange={(e) => setAiGuidance(e.target.value)}
                  placeholder="e.g., Focus on productivity metrics, target VP-level audience..."
                  className="min-h-16 resize-none"
                  disabled={isGenerating}
                />
              </div>

              {/* Post Length - Chip Selector */}
              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Post Length</label>
                <div className="flex gap-2">
                  {LENGTH_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => !isGenerating && setAiLength(opt.value)}
                      disabled={isGenerating}
                      className={cn(
                        "flex-1 px-3 py-2.5 rounded-lg border text-center transition-all duration-200 cursor-pointer",
                        aiLength === opt.value
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted/50 text-muted-foreground",
                        isGenerating && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="text-base block mb-0.5">{opt.icon}</span>
                      <span className="text-xs font-medium block">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Post Count - Chip Selector */}
              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Number of Posts</label>
                <div className="flex gap-2">
                  {POST_COUNT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => !isGenerating && setAiPostCount(opt.value)}
                      disabled={isGenerating}
                      className={cn(
                        "flex-1 px-3 py-2.5 rounded-lg border text-center transition-all duration-200 cursor-pointer",
                        aiPostCount === opt.value
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted/50 text-muted-foreground",
                        isGenerating && "opacity-50 cursor-not-allowed"
                      )}
                    >
                      <span className="text-lg font-bold block mb-0.5">{opt.icon}</span>
                      <span className="text-xs font-medium block">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Tone - Visual Grid */}
              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Tone & Style</label>
                <div className="grid grid-cols-3 gap-2">
                  {TONE_OPTIONS.map(opt => {
                    const Icon = opt.icon;
                    return (
                      <button
                        key={opt.value}
                        onClick={() => !isGenerating && setAiTone(opt.value)}
                        disabled={isGenerating}
                        className={cn(
                          "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200 cursor-pointer text-left",
                          aiTone === opt.value
                            ? "border-primary bg-primary/10 shadow-sm"
                            : "border-border hover:border-primary/30 hover:bg-muted/50",
                          isGenerating && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        <Icon className={cn("h-4 w-4 shrink-0", aiTone === opt.value ? "text-primary" : opt.color)} />
                        <div className="min-w-0">
                          <span className={cn(
                            "text-xs font-medium block truncate",
                            aiTone === opt.value ? "text-primary" : "text-foreground"
                          )}>
                            {opt.label}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Advanced Options Toggle */}
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                  disabled={isGenerating}
                >
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="font-medium">Source Materials</span>
                  <span className="text-xs">(optional)</span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-4 animate-fade-in">
                    {/* Website URL */}
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                        <Globe className="h-3.5 w-3.5 text-primary" />
                        Reference Website
                      </label>
                      <Input
                        value={aiWebsiteUrl}
                        onChange={(e) => setAiWebsiteUrl(e.target.value)}
                        placeholder="https://yourcompany.com/about"
                        disabled={isGenerating}
                        type="url"
                        className="h-9 text-sm"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        AI will read this page and use its content as source material
                      </p>
                    </div>

                    {/* Reference PDF */}
                    <div className="rounded-lg border border-border p-3 space-y-2">
                      <label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                        <Paperclip className="h-3.5 w-3.5 text-primary" />
                        Reference Document (PDF)
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
                        <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm flex-1 truncate text-foreground">{aiReferenceFile.name}</span>
                          {isParsingRef && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                          {!isParsingRef && <span className="text-[11px] text-emerald-500 font-medium">Ready</span>}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
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
                          className="w-full h-9 text-sm"
                          onClick={() => refFileInputRef.current?.click()}
                          disabled={isGenerating}
                        >
                          <Paperclip className="h-3.5 w-3.5 mr-2" />
                          Attach PDF
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isGenerating || isParsingRef || !aiTopic.trim()}
                variant="glow"
                className="w-full h-12 text-accent font-semibold text-base"
              >
                {isGenerating ? (
                  <>
                    <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                    Generating your posts...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-5 w-5 mr-2" />
                    Generate Posts
                  </>
                )}
              </Button>
            </div>
          )}

          {/* Content Editor (after upload/generate/manual create) */}
          {showContentEditor && (
            <div className="space-y-4 animate-fade-in">
              {fileName && (
                <div className="flex items-center gap-2 p-3 bg-primary/5 rounded-lg border border-primary/20">
                  <FileText className="h-5 w-5 text-primary" />
                  <span className="text-sm flex-1 truncate font-medium">{fileName}</span>
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
                  className="h-11"
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
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-2 px-6 pb-6 pt-2 border-t border-border/50">
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
