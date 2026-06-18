import { useState, useMemo, useEffect, useRef } from 'react';
import { EngagementPost, usePostComment } from '@/hooks/useEngagement';
import { Publisher } from '@/hooks/usePublishers';
import { supabase } from '@/integrations/supabase/client';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Send, Save, CheckCircle2, Mic, Lock } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useWorkspacePermissions } from '@/hooks/useWorkspacePermissions';

interface CommentComposerProps {
  post: EngagementPost;
  publisher: Publisher;
  onClose: () => void;
}

interface Classification {
  post_type?: string;
  subject?: string;
  comment_strategy?: string;
}

// Extract a one-line summary from the voice profile (first line after "Writing Voice:" or first 80 chars)
function extractVoiceSummary(voiceProfile: string | null | undefined): string {
  if (!voiceProfile) return '';
  const text = voiceProfile.trim();
  const voiceMatch = text.match(/(?:writing voice|voice)[:\s]*\n?([^\n]{15,200})/i);
  if (voiceMatch) return voiceMatch[1].trim().replace(/[*_#]/g, '');
  // Fall back to first non-heading line
  const firstLine = text.split('\n').map((l) => l.trim()).find((l) => l && !l.startsWith('#') && l.length > 20);
  if (firstLine) return firstLine.slice(0, 140).replace(/[*_#]/g, '');
  return text.slice(0, 140);
}

function formatPostType(type?: string): string {
  if (!type) return 'post';
  return type.replace(/_/g, ' ');
}

export function CommentComposer({ post, publisher, onClose }: CommentComposerProps) {
  const [commentText, setCommentText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [justPosted, setJustPosted] = useState(false);
  const [classification, setClassification] = useState<Classification | null>(null);
  const { saveDraft, postComment } = usePostComment();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { can } = useWorkspacePermissions();

  const voiceSummary = useMemo(
    () => extractVoiceSummary((publisher as any).voice_profile),
    [publisher],
  );

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const handleGenerate = async () => {
    if (!can.generateAi) {
      toast.error('Your role does not allow AI generation in this workspace');
      return;
    }
    if (!post.content) {
      toast.error('Post has no text content to base a comment on');
      return;
    }

    setIsGenerating(true);
    setClassification(null);
    try {
      const authorName = (post.post_metadata as any)?.author_name || 'this person';
      const { data, error } = await supabase.functions.invoke('generate-comment', {
        body: {
          post_content: post.content,
          author_name: authorName,
          publisher_name: publisher.name,
          voice_profile: (publisher as any).voice_profile || '',
        },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || 'Failed to generate comment');

      const generated = data.comment || '';
      if (data.classification) setClassification(data.classification as Classification);

      if (generated) {
        setCommentText(generated);
        // Refocus textarea after fill
        setTimeout(() => textareaRef.current?.focus(), 0);
      } else {
        toast.error('AI returned empty response');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Generation failed';
      toast.error(msg);
    } finally {
      setIsGenerating(false);
    }
  };

  const handlePost = async () => {
    if (!can.publishLinkedIn) {
      toast.error('Your role does not allow publishing to LinkedIn');
      return;
    }
    if (!commentText.trim()) return;
    try {
      const draft = await saveDraft.mutateAsync({
        publisher_id: publisher.id,
        post_id: post.id,
        comment_text: commentText.trim(),
      });
      await postComment.mutateAsync({
        engagement_comment_id: draft.id,
        publisher_id: publisher.id,
        post_id: post.id,
        comment_text: commentText.trim(),
      });
      setJustPosted(true);
      setTimeout(() => {
        setCommentText('');
        onClose();
      }, 1500);
    } catch { /* hook handles toast */ }
  };

  const handleSaveDraft = async () => {
    if (!commentText.trim()) return;
    await saveDraft.mutateAsync({
      publisher_id: publisher.id,
      post_id: post.id,
      comment_text: commentText.trim(),
    });
    toast.success('Draft saved');
    setCommentText('');
    onClose();
  };

  if (justPosted) {
    return (
      <div className="px-8 py-10 flex items-center gap-3 text-emerald-700">
        <CheckCircle2 className="h-5 w-5" />
        <span className="font-display font-semibold text-base">Comment posted to LinkedIn</span>
      </div>
    );
  }

  const hasText = commentText.trim().length > 0;

  return (
    <div className="flex flex-col overflow-hidden">
      {/* ── Top strip: classification + voice ────────────────────────── */}
      <div className="px-6 pt-5 pb-3 border-b border-border/50 bg-muted/20 space-y-2">
        {/* Classification reveal */}
        <div className="flex items-center gap-2 min-h-[18px]">
          <Sparkles className={cn(
            'h-3 w-3 flex-shrink-0',
            classification ? 'text-amber-500' : 'text-muted-foreground/40',
          )} />
          <p className="text-[10.5px] font-mono uppercase tracking-[0.14em] text-muted-foreground/80 truncate">
            {isGenerating ? (
              <span className="text-amber-600">classifying post…</span>
            ) : classification ? (
              <>
                <span className="text-amber-700 font-semibold">
                  {formatPostType(classification.post_type)}
                </span>
                {classification.comment_strategy && (
                  <>
                    <span className="mx-1.5 text-border">·</span>
                    <span>{classification.comment_strategy}</span>
                  </>
                )}
                {classification.subject && (
                  <>
                    <span className="mx-1.5 text-border">·</span>
                    <span>mention {classification.subject}</span>
                  </>
                )}
              </>
            ) : (
              <span className="text-muted-foreground/50">classifier will read this post when you suggest</span>
            )}
          </p>
        </div>

        {/* Voice context */}
        <div className="flex items-center gap-2">
          <Mic className="h-3 w-3 flex-shrink-0 text-primary/60" />
          <p className="text-[11px] text-muted-foreground truncate">
            <span className="font-semibold text-foreground/80">Writing as {publisher.name}</span>
            {voiceSummary && (
              <>
                <span className="mx-1.5 text-border">·</span>
                <span className="text-muted-foreground/80">{voiceSummary}</span>
              </>
            )}
            {!voiceSummary && (
              <>
                <span className="mx-1.5 text-border">·</span>
                <span className="text-muted-foreground/60 italic">no voice profile yet</span>
              </>
            )}
          </p>
        </div>
      </div>

      {/* ── Textarea ─────────────────────────────────────────────────── */}
      <div className="relative px-6 py-4 flex-1 min-h-0">
        {isGenerating && (
          <div className="absolute top-0 left-0 right-0 h-0.5 overflow-hidden">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-amber-400 to-transparent animate-[shimmer_1.2s_ease-in-out_infinite]" />
          </div>
        )}
        <Textarea
          ref={textareaRef}
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
          placeholder={isGenerating ? '' : "Write something only you would say…"}
          rows={4}
          className={cn(
            'font-display text-[16px] leading-[1.55] resize-none border-0 shadow-none px-0 py-0',
            'focus-visible:ring-0 focus-visible:outline-none caret-amber-500',
            'placeholder:text-muted-foreground/40',
            isGenerating && 'opacity-50',
          )}
          autoFocus
          disabled={isGenerating}
        />
        {isGenerating && classification?.comment_strategy && (
          <p className="absolute inset-x-6 top-4 font-display text-[16px] leading-[1.55] text-amber-700/40 italic pointer-events-none animate-pulse">
            {classification.comment_strategy}…
          </p>
        )}
      </div>

      {/* ── Footer: char count + actions ─────────────────────────────── */}
      <div className="px-6 py-3 border-t bg-background flex items-center justify-between">
        <span className="text-[10px] font-mono text-muted-foreground/60 tabular-nums">
          {commentText.length > 0 && `${commentText.length} chars`}
        </span>

        <div className="flex items-center gap-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-8 text-xs text-muted-foreground"
            onClick={onClose}
          >
            Cancel
          </Button>

          <Button
            variant="outline"
            size="sm"
            className="h-8 text-xs gap-1.5"
            onClick={handleSaveDraft}
            disabled={!hasText}
          >
            <Save className="h-3 w-3" />
            Draft
          </Button>

          <Button
            size="sm"
            className={cn(
              'h-8 text-xs gap-1.5 font-semibold transition-all',
              'bg-amber-500 hover:bg-amber-600 text-white shadow-sm shadow-amber-500/30',
              isGenerating && 'animate-pulse',
            )}
            disabled={isGenerating || !post.content || !can.generateAi}
            onClick={handleGenerate}
            title={!can.generateAi ? 'Your role cannot use AI generation' : undefined}
          >
            {isGenerating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : !can.generateAi ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Sparkles className="h-3.5 w-3.5" />
            )}
            {isGenerating ? 'Writing…' : 'AI Suggest'}
          </Button>

          <Button
            size="sm"
            className={cn(
              'h-8 text-xs gap-1.5 font-semibold transition-all',
              hasText && can.publishLinkedIn
                ? 'bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm shadow-primary/20'
                : 'bg-muted text-muted-foreground/60',
            )}
            onClick={handlePost}
            disabled={!hasText || postComment.isPending || !can.publishLinkedIn}
            title={!can.publishLinkedIn ? 'Your role cannot publish to LinkedIn' : undefined}
          >
            {postComment.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : !can.publishLinkedIn ? (
              <Lock className="h-3.5 w-3.5" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Post
          </Button>
        </div>
      </div>
    </div>
  );
}
