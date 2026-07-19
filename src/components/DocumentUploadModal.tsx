import { useState, useCallback, useRef, useEffect } from 'react';
import { Upload, FileText, X, Plus, Sparkles, Loader2, Globe, Paperclip, PenLine, Wand2, ChevronDown, ChevronUp, Link2, GitMerge, Layers, Check, AlignLeft } from 'lucide-react';
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
import { Publisher } from '@/hooks/usePublishers';
import { PublisherAvatar } from '@/components/PublisherAvatar';
import { useWorkspacePermissions } from '@/hooks/useWorkspacePermissions';

interface DocumentUploadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSave: (data: { title: string; content: string; fileName?: string; fileUrl?: string; publisherIds?: string[] }) => void;
  showAiCreate?: boolean;
  publishers?: Publisher[];
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

export function DocumentUploadModal({ open, onOpenChange, onSave, showAiCreate, publishers = [] }: DocumentUploadModalProps) {
  const { can } = useWorkspacePermissions();
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
  const [generatingPhase, setGeneratingPhase] = useState(0);

  const [aiWebsiteUrls, setAiWebsiteUrls] = useState<string[]>(['']);
  const [urlStrategy, setUrlStrategy] = useState<'cross' | 'single'>('cross');
  const [aiReferenceFile, setAiReferenceFile] = useState<File | null>(null);
  const [aiReferenceContent, setAiReferenceContent] = useState('');
  const [aiLength, setAiLength] = useState('medium');
  const [aiPostCount, setAiPostCount] = useState('4-6');
  const [isParsingRef, setIsParsingRef] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [selectedPublisherIds, setSelectedPublisherIds] = useState<string[]>([]);
  const [isStructuring, setIsStructuring] = useState(false);
  const [structureSuggestion, setStructureSuggestion] = useState<{
    structured: string;
    changes: Array<{ type: string; note: string }>;
    hook_note: string;
  } | null>(null);
  const refFileInputRef = useRef<HTMLInputElement>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const GENERATING_PHASES = [
    { icon: '🔍', text: 'Researching your topic...' },
    { icon: '🧠', text: 'Crafting the narrative...' },
    { icon: '✍️', text: 'Writing your posts...' },
    { icon: '✨', text: 'Polishing the content...' },
  ];

  useEffect(() => {
    if (!isGenerating) {
      setGeneratingPhase(0);
      return;
    }
    const interval = setInterval(() => {
      setGeneratingPhase(prev => (prev + 1) % GENERATING_PHASES.length);
    }, 3000);
    return () => clearInterval(interval);
  }, [isGenerating]);

  const resetForm = () => {
    setMode('upload');
    setTitle('');
    setContent('');
    setFileName(null);
    setFileUrl(null);
    setAiTopic('');
    setAiGuidance('');
    setAiWebsiteUrls(['']);
    setUrlStrategy('cross');
    setAiReferenceFile(null);
    setAiReferenceContent('');
    setAiLength('medium');
    setAiPostCount('4-6');
    setShowAdvanced(false);
    setSelectedPublisherIds([]);
    setStructureSuggestion(null);
    setIsStructuring(false);
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
    // Guard: size (20 MB) and extension whitelist so users get a clear message
    // instead of a silent failure.
    const MAX_BYTES = 20 * 1024 * 1024;
    if (file.size > MAX_BYTES) {
      toast.error(`File is too large (max 20 MB). Yours is ${(file.size / 1024 / 1024).toFixed(1)} MB.`);
      return;
    }
    const lowerName = file.name.toLowerCase();
    const allowedExts = ['.txt', '.md', '.csv', '.docx', '.pdf'];
    if (!allowedExts.some(ext => lowerName.endsWith(ext))) {
      toast.error('Unsupported file type. Use .txt, .md, .csv, .docx, or .pdf');
      return;
    }

    setIsLoading(true);
    try {
      const storagePath = `${Date.now()}-${file.name}`;
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, file, { contentType: file.type || undefined, upsert: false });
      if (uploadError) throw uploadError;

      const { data: urlData } = supabase.storage
        .from('documents')
        .getPublicUrl(storagePath);

      setFileName(file.name);
      setFileUrl(urlData.publicUrl);
      setTitle(file.name.replace(/\.[^/.]+$/, ''));

      if (lowerName.endsWith('.txt') || lowerName.endsWith('.md')) {
        const text = await file.text();
        setContent(text);
      } else {
        // .docx, .csv, .pdf → parse server-side
        const formData = new FormData();
        formData.append('file', file);
        const { data, error } = await supabase.functions.invoke('parse-document', {
          body: formData,
        });
        if (error) throw error;
        if (!data?.success) throw new Error(data?.error || 'Failed to parse document');
        setContent(data.content || '');
      }
    } catch (error) {
      console.error('Error processing file:', error);
      const message = error instanceof Error ? error.message : 'Failed to process file';
      toast.error(message);
      setFileName(null);
      setFileUrl(null);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      await processFile(file);
    }
  }, []);

  const handleFileInput = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    // Reset value so selecting the same file again still fires onChange.
    e.target.value = '';
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
    if (!can.generateAi) {
      toast.error('Your role does not allow AI generation in this workspace');
      return;
    }
    if (!aiTopic.trim()) {
      toast.error('Please enter a topic');
      return;
    }
    if (selectedPublisherIds.length === 0) {
      toast.error('Please select at least one publisher');
      return;
    }
    setIsGenerating(true);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const validUrls = aiWebsiteUrls.map(u => u.trim()).filter(Boolean);
      
      // Gather selected publisher profiles with voice data
      const publisherLinkedInUrls = selectedPublisherIds
        .map(id => publishers.find(p => p.id === id))
        .filter(Boolean)
        .map(p => ({
          name: p!.name,
          linkedinUrl: p!.linkedin_url || '',
          voiceProfile: (p as any).voice_profile || '',
        }));

      const { data, error } = await supabase.functions.invoke('create-document', {
        body: {
          topic: aiTopic.trim(),
          guidance: aiGuidance.trim() || undefined,
          websiteUrls: validUrls.length > 0 ? validUrls : undefined,
          urlStrategy: validUrls.length > 1 ? urlStrategy : 'cross',
          referenceContent: aiReferenceContent || undefined,
          length: aiLength,
          postCount: aiPostCount,
          publisherProfiles: publisherLinkedInUrls.length > 0 ? publisherLinkedInUrls : undefined,
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

  // Structural edit: restructures the pasted text for readability without
  // changing what it says. Uses the selected publisher's voice profile so the
  // result still sounds like them.
  const handleStructure = async () => {
    if (!content.trim()) {
      toast.error('Paste or write some content first');
      return;
    }
    setIsStructuring(true);
    setStructureSuggestion(null);
    try {
      const publisher = publishers.find((p) => p.id === selectedPublisherIds[0]);
      const { data, error } = await supabase.functions.invoke('structure-post', {
        body: {
          content: content.trim(),
          voice_profile: (publisher as any)?.voice_profile || undefined,
          publisher_name: publisher?.name || undefined,
        },
      });
      if (error || !data?.success) {
        toast.error(data?.error || error?.message || 'Could not analyze the content');
        return;
      }
      if (!data.structured || data.structured.trim() === content.trim()) {
        toast.success('The structure already reads well — no changes suggested');
        return;
      }
      setStructureSuggestion({
        structured: data.structured,
        changes: Array.isArray(data.changes) ? data.changes : [],
        hook_note: data.hook_note || '',
      });
    } catch (err) {
      console.error('structure-post failed:', err);
      toast.error('Could not analyze the content');
    } finally {
      setIsStructuring(false);
    }
  };

  const applyStructure = () => {
    if (!structureSuggestion) return;
    setContent(structureSuggestion.structured);
    setStructureSuggestion(null);
    toast.success('Structure applied');
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
      publisherIds: selectedPublisherIds.length > 0 ? selectedPublisherIds : undefined,
    });
    handleClose();
  };

  const showContentEditor = mode === 'create' || (mode === 'ai' && content) || fileName;

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
                accept=".txt,.md,.csv,.docx,.pdf"
                onChange={handleFileInput}
                disabled={isLoading}
              />
              <label htmlFor="file-upload" className={cn("cursor-pointer", isLoading && "pointer-events-none opacity-60")}>
                <div className="flex flex-col items-center gap-3">
                  <div className={cn(
                    "w-14 h-14 rounded-2xl flex items-center justify-center transition-all duration-300",
                    isDragging
                      ? "bg-primary text-primary-foreground scale-110"
                      : "bg-primary/10 text-primary"
                  )}>
                    {isLoading ? <Loader2 className="h-7 w-7 animate-spin" /> : <Upload className="h-7 w-7" />}
                  </div>
                  <div>
                    <p className="font-medium text-foreground">
                      {isLoading ? 'Uploading…' : 'Drop your file here or click to browse'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Supports .txt, .md, .csv, .docx, and .pdf (max 20 MB)
                    </p>
                  </div>
                </div>
              </label>
            </div>
          )}

          {/* AI Mode */}
          {mode === 'ai' && !content && isGenerating && (
            <div className="flex flex-col items-center justify-center py-16 space-y-6 animate-fade-in min-h-[340px]">
              {/* Animated orb */}
              <div className="relative w-20 h-20">
                <div className="absolute inset-0 rounded-full bg-primary/20 animate-ping" />
                <div className="absolute inset-2 rounded-full bg-primary/30 animate-pulse" />
                <div className="absolute inset-0 flex items-center justify-center text-3xl animate-bounce">
                  {GENERATING_PHASES[generatingPhase].icon}
                </div>
              </div>

              {/* Phase text */}
              <p className="text-sm font-medium text-foreground animate-pulse">
                {GENERATING_PHASES[generatingPhase].text}
              </p>

              {/* Progress dots */}
              <div className="flex gap-2">
                {GENERATING_PHASES.map((_, i) => (
                  <div
                    key={i}
                    className={cn(
                      "w-2 h-2 rounded-full transition-all duration-500",
                      i <= generatingPhase ? "bg-primary scale-100" : "bg-muted-foreground/30 scale-75"
                    )}
                  />
                ))}
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={handleClose}
                className="text-xs"
              >
                Cancel
              </Button>
            </div>
          )}

          {mode === 'ai' && !content && !isGenerating && (
            <div className="space-y-5 animate-fade-in">
              {/* Publisher Selection */}
              {publishers.length > 0 && (
                <div>
                  <label className="text-sm font-medium mb-2 block text-foreground">
                    Who is writing? <span className="text-muted-foreground font-normal">(select publisher/s)</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {publishers.map(pub => {
                      const isSelected = selectedPublisherIds.includes(pub.id);
                      return (
                        <button
                          key={pub.id}
                          onClick={() => {
                            setSelectedPublisherIds(prev =>
                              isSelected ? prev.filter(id => id !== pub.id) : [...prev, pub.id]
                            );
                          }}
                          className={cn(
                            "flex items-center gap-2 px-3 py-2 rounded-lg border transition-all duration-200",
                            isSelected
                              ? "border-primary bg-primary/10 shadow-sm"
                              : "border-border hover:border-primary/30 hover:bg-muted/50"
                          )}
                        >
                          <PublisherAvatar name={pub.name} size="sm" />
                          <span className={cn(
                            "text-xs font-medium",
                            isSelected ? "text-primary" : "text-foreground"
                          )}>
                            {pub.name}
                          </span>
                          {isSelected && <Check className="h-3.5 w-3.5 text-primary" />}
                          {!pub.linkedin_url && (
                            <span className="text-[10px] text-muted-foreground">(no URL)</span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Topic */}
              <div>
                <label className="text-sm font-medium mb-1.5 block text-foreground">
                  What should the posts be about?
                </label>
                <Input
                  value={aiTopic}
                  onChange={(e) => setAiTopic(e.target.value)}
                  placeholder="e.g., Benefits of remote work for engineering teams"
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
                />
              </div>

              {/* Source Materials */}
              <div>
                <button
                  onClick={() => setShowAdvanced(!showAdvanced)}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors w-full"
                >
                  {showAdvanced ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  <span className="font-medium">Source Materials</span>
                  <span className="text-xs">(optional)</span>
                </button>

                {showAdvanced && (
                  <div className="mt-3 space-y-4 animate-fade-in">
                    {/* Reference Websites - multi-URL */}
                    <div className="rounded-lg border border-border p-3 space-y-3">
                      <label className="text-xs font-medium flex items-center gap-1.5 text-foreground">
                        <Globe className="h-3.5 w-3.5 text-primary" />
                        Reference Websites
                      </label>

                      {aiWebsiteUrls.map((url, idx) => (
                        <div key={idx} className="flex items-center gap-2">
                          <Link2 className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                          <Input
                            value={url}
                            onChange={(e) => {
                              const next = [...aiWebsiteUrls];
                              next[idx] = e.target.value;
                              setAiWebsiteUrls(next);
                            }}
                            placeholder={`https://example.com${idx > 0 ? `/page-${idx + 1}` : '/about'}`}
                            type="url"
                            className="h-9 text-sm flex-1"
                          />
                          {aiWebsiteUrls.length > 1 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-destructive"
                              onClick={() => setAiWebsiteUrls(aiWebsiteUrls.filter((_, i) => i !== idx))}
                            >
                              <X className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </div>
                      ))}

                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full h-8 text-xs gap-1.5"
                        onClick={() => setAiWebsiteUrls([...aiWebsiteUrls, ''])}
                      >
                        <Plus className="h-3.5 w-3.5" />
                        Add another URL
                      </Button>

                      {/* URL Strategy toggle — only visible when 2+ URLs are filled */}
                      {aiWebsiteUrls.filter(u => u.trim()).length >= 2 && (
                        <div className="pt-1 space-y-1.5">
                          <p className="text-[11px] font-medium text-foreground">How should the AI use these sources?</p>
                          <div className="grid grid-cols-2 gap-2">
                            <button
                              onClick={() => setUrlStrategy('cross')}
                              className={cn(
                                "flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all duration-200",
                                urlStrategy === 'cross'
                                  ? "border-primary bg-primary/10 shadow-sm"
                                  : "border-border hover:border-primary/30 hover:bg-muted/50"
                              )}
                            >
                              <GitMerge className={cn("h-4 w-4 mt-0.5 shrink-0", urlStrategy === 'cross' ? "text-primary" : "text-muted-foreground")} />
                              <div>
                                <p className={cn("text-xs font-medium", urlStrategy === 'cross' ? "text-primary" : "text-foreground")}>Cross data</p>
                                <p className="text-xs text-muted-foreground leading-tight mt-0.5">AI combines all URLs into a unified context</p>
                              </div>
                            </button>
                            <button
                              onClick={() => setUrlStrategy('single')}
                              className={cn(
                                "flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all duration-200",
                                urlStrategy === 'single'
                                  ? "border-primary bg-primary/10 shadow-sm"
                                  : "border-border hover:border-primary/30 hover:bg-muted/50"
                              )}
                            >
                              <Layers className={cn("h-4 w-4 mt-0.5 shrink-0", urlStrategy === 'single' ? "text-primary" : "text-muted-foreground")} />
                              <div>
                                <p className={cn("text-xs font-medium", urlStrategy === 'single' ? "text-primary" : "text-foreground")}>Single source</p>
                                <p className="text-xs text-muted-foreground leading-tight mt-0.5">Each post uses one URL as its sole data source</p>
                              </div>
                            </button>
                          </div>
                        </div>
                      )}

                      <p className="text-[11px] text-muted-foreground">
                        AI will fetch and read each page as source material
                      </p>
                    </div>

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
                      />
                      {aiReferenceFile ? (
                        <div className="flex items-center gap-2 p-2 bg-primary/5 rounded-lg border border-primary/20">
                          <FileText className="h-4 w-4 text-primary shrink-0" />
                          <span className="text-sm flex-1 truncate text-foreground">{aiReferenceFile.name}</span>
                          {isParsingRef && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                          {!isParsingRef && <span className="text-[11px] text-success font-medium">Ready</span>}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-6 w-6 shrink-0"
                            onClick={() => {
                              setAiReferenceFile(null);
                              setAiReferenceContent('');
                            }}
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
                        >
                          <Paperclip className="h-3.5 w-3.5 mr-2" />
                          Attach PDF
                        </Button>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Post Length */}
              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Post Length</label>
                <div className="flex gap-2">
                  {LENGTH_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAiLength(opt.value)}
                      className={cn(
                        "flex-1 px-3 py-2.5 rounded-lg border text-center transition-all duration-200 cursor-pointer",
                        aiLength === opt.value
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <span className="text-base block mb-0.5">{opt.icon}</span>
                      <span className="text-xs font-medium block">{opt.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Post Count */}
              <div>
                <label className="text-sm font-medium mb-2 block text-foreground">Number of Posts</label>
                <div className="flex gap-2">
                  {POST_COUNT_OPTIONS.map(opt => (
                    <button
                      key={opt.value}
                      onClick={() => setAiPostCount(opt.value)}
                      className={cn(
                        "flex-1 px-3 py-2.5 rounded-lg border text-center transition-all duration-200 cursor-pointer",
                        aiPostCount === opt.value
                          ? "border-primary bg-primary/10 text-primary shadow-sm"
                          : "border-border hover:border-primary/40 hover:bg-muted/50 text-muted-foreground"
                      )}
                    >
                      <span className="text-lg font-bold block mb-0.5">{opt.icon}</span>
                      <span className="text-xs font-medium block">{opt.description}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Generate Button */}
              <Button
                onClick={handleGenerate}
                disabled={isParsingRef || !aiTopic.trim() || !can.generateAi}
                variant="glow"
                className="w-full h-12 text-accent font-semibold text-base"
                title={!can.generateAi ? 'Your role cannot use AI generation' : undefined}
              >
                <Sparkles className="h-5 w-5 mr-2" />
                {can.generateAi ? 'Generate Posts' : 'No permission to generate'}
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
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-sm font-medium">Content</label>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 text-xs gap-1.5"
                    onClick={handleStructure}
                    disabled={isStructuring || !content.trim()}
                  >
                    {isStructuring ? (
                      <>
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Reading…
                      </>
                    ) : (
                      <>
                        <AlignLeft className="h-3.5 w-3.5" />
                        Improve structure
                      </>
                    )}
                  </Button>
                </div>
                <Textarea
                  value={content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Document content..."
                  className="min-h-48 resize-none"
                />
              </div>

              {structureSuggestion && (
                <div className="rounded-lg border border-primary/30 bg-primary/5 overflow-hidden animate-fade-in">
                  <div className="flex items-center justify-between px-3 py-2 border-b border-primary/20">
                    <span className="text-xs font-medium text-primary flex items-center gap-1.5">
                      <AlignLeft className="h-3.5 w-3.5" />
                      Suggested structure
                    </span>
                    <div className="flex items-center gap-1.5">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 text-xs"
                        onClick={() => setStructureSuggestion(null)}
                      >
                        Dismiss
                      </Button>
                      <Button size="sm" className="h-7 text-xs gap-1" onClick={applyStructure}>
                        <Check className="h-3.5 w-3.5" />
                        Apply
                      </Button>
                    </div>
                  </div>

                  {structureSuggestion.hook_note && (
                    <p className="px-3 pt-2.5 text-[11px] text-muted-foreground">
                      <span className="font-medium text-foreground">Opening: </span>
                      {structureSuggestion.hook_note}
                    </p>
                  )}

                  {structureSuggestion.changes.length > 0 && (
                    <ul className="px-3 pt-2 space-y-1">
                      {structureSuggestion.changes.map((c, i) => (
                        <li key={i} className="text-[11px] text-muted-foreground flex gap-1.5">
                          <span className="shrink-0 px-1.5 rounded bg-primary/10 text-primary font-medium">
                            {c.type}
                          </span>
                          <span>{c.note}</span>
                        </li>
                      ))}
                    </ul>
                  )}

                  <div className="p-3">
                    <div className="max-h-64 overflow-y-auto rounded-md bg-background border border-border p-3">
                      <p className="text-sm whitespace-pre-wrap text-foreground">
                        {structureSuggestion.structured}
                      </p>
                    </div>
                  </div>
                </div>
              )}
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
