import { useState } from 'react';
import { EngagementPost, usePostComment } from '@/hooks/useEngagement';
import { Publisher } from '@/hooks/usePublishers';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Send, Save, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface CommentComposerProps {
  post: EngagementPost;
  publisher: Publisher;
  onClose: () => void;
}

export function CommentComposer({ post, publisher, onClose }: CommentComposerProps) {
  const [commentText, setCommentText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const [justPosted, setJustPosted] = useState(false);
  const { saveDraft, postComment } = usePostComment();

  const handleGenerate = async () => {
    if (!post.content) {
      toast.error('Post has no text content to base a comment on');
      return;
    }

    setIsGenerating(true);
    try {
      // Build persona block — use voice profile if available
      let personaBlock: string;
      if ((publisher as any).voice_profile) {
        personaBlock = `You are ${publisher.name}. Here is your voice profile — use it to match your authentic tone, vocabulary, and perspective:\n\n${(publisher as any).voice_profile}\n\n`;
      } else {
        personaBlock = `You are ${publisher.name}${publisher.headline ? `, ${publisher.headline}` : ''}${publisher.company_name ? ` at ${publisher.company_name}` : ''}.\n\n`;
      }

      const prompt = `${personaBlock}Write a short, genuine LinkedIn comment (2-3 sentences max) on this post. Be conversational, add value or share a relevant perspective. Do NOT be generic or sycophantic. Do NOT use emojis excessively. Sound like a real person, not a bot. Match the voice profile above.

Post content:
"""
${post.content.slice(0, 1500)}
"""

Reply with ONLY the comment text, nothing else.`;

      const { data, error } = await supabase.functions.invoke('create-document', {
        body: {
          topic: prompt,
          postCount: 'single',
          length: 'super_short',
        },
      });

      if (error) throw error;

      let generated = data?.content || '';
      generated = generated.replace(/^(#{1,3}\s*)?Post\s*\d+[:\s]*/i, '').trim();
      const lines = generated.split('\n').filter((l: string) => l.trim());
      if (lines.length > 1 && lines[0].startsWith('#')) {
        lines.shift();
      }
      generated = lines.join('\n').trim();

      if (generated) {
        setCommentText(generated);
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
    } catch {
      // Error handled by hook toasts
    }
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

  // Success state
  if (justPosted) {
    return (
      <Card className="p-4 border-primary/30 bg-primary/5">
        <div className="flex items-center gap-2 text-primary">
          <CheckCircle2 className="h-4 w-4" />
          <span className="text-sm font-medium">Comment posted to LinkedIn</span>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-4 space-y-3 border-primary/20">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Commenting as <span className="text-foreground font-semibold">{publisher.name}</span>
        </span>

        {/* AI Suggest — the hero button */}
        <Button
          variant="outline"
          size="sm"
          className={cn(
            'h-7 gap-1.5 text-xs font-medium border-primary/30 text-primary hover:bg-primary/10 hover:text-primary transition-all',
            isGenerating && 'animate-pulse',
          )}
          disabled={isGenerating || !post.content}
          onClick={handleGenerate}
        >
          {isGenerating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <Sparkles className="h-3.5 w-3.5" />
          )}
          {isGenerating ? 'Writing...' : 'AI Suggest'}
        </Button>
      </div>

      {/* Textarea */}
      <Textarea
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder="Write a thoughtful comment..."
        rows={3}
        className="text-sm leading-relaxed resize-none focus-visible:ring-primary/30"
        autoFocus
      />

      {/* Character count + actions */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">
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
            disabled={!commentText.trim()}
          >
            <Save className="h-3 w-3" />
            Draft
          </Button>
          <Button
            size="sm"
            className="h-8 text-xs gap-1.5 font-semibold"
            onClick={handlePost}
            disabled={!commentText.trim() || postComment.isPending}
          >
            {postComment.isPending ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Send className="h-3.5 w-3.5" />
            )}
            Post to LinkedIn
          </Button>
        </div>
      </div>
    </Card>
  );
}
