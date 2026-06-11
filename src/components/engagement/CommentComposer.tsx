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
      // Build persona context
      let personaContext: string;
      if ((publisher as any).voice_profile) {
        personaContext = `You are ${publisher.name}. Here is your voice profile:\n\n${(publisher as any).voice_profile}`;
      } else {
        personaContext = `You are ${publisher.name}${publisher.headline ? `, ${publisher.headline}` : ''}${publisher.company_name ? ` at ${publisher.company_name}` : ''}.`;
      }

      // Get the target person's name from post metadata
      const authorName = (post.post_metadata as any)?.author_name || 'this person';

      // Build a comment-specific prompt — NOT the create-document post prompt.
      // Comments need to sound like a real person typed a quick reply.
      const commentPrompt = `${personaContext}

TASK: Write a LinkedIn comment on this post by ${authorName}.

COMMENT RULES (follow these exactly):
- 1-3 sentences max. This is a comment, not an essay.
- Sound like a REAL HUMAN who typed this in 30 seconds
- Reference something SPECIFIC from the post (a number, a claim, an example)
- Add value: share a related experience, complementary insight, respectful pushback, or specific question
- NEVER start with "Great post!" / "Love this!" / "So true!" / "Couldn't agree more" — those are bot tells
- NEVER use em dashes
- Contractions are fine. Casual phrasing is fine.
- It's OK to respectfully disagree or add nuance
- Match the voice profile tone — same vocabulary, same formality level

GOOD examples:
"The 47% stat surprised me. We saw something similar but the driver was completely different. For us it was onboarding friction, not pricing."
"Interesting framing. I'd push back on the 'less is more' point though. In our market the teams consolidating tools actually saw slower deal cycles."
"This mirrors exactly what happened to us in Q3. Ended up rebuilding the entire scoring model. Worth it."

BAD examples (NEVER write these):
"Great insights! This really resonates with my experience."
"Love this perspective! Couldn't agree more."
"What a powerful post! Thanks for sharing."

POST CONTENT:
"""
${post.content.slice(0, 2000)}
"""

Write ONLY the comment text. Nothing else.`;

      const { data, error } = await supabase.functions.invoke('create-document', {
        body: { topic: commentPrompt, postCount: 'single', length: 'super_short' },
      });
      if (error) throw error;

      let generated = data?.content || '';
      generated = generated.replace(/^(#{1,3}\s*)?Post\s*\d+[:\s]*/i, '').trim();
      const lines = generated.split('\n').filter((l: string) => l.trim());
      if (lines.length > 1 && lines[0].startsWith('#')) lines.shift();
      generated = lines.join('\n').trim();
      // Strip any wrapping quotes the AI might add
      generated = generated.replace(/^["']|["']$/g, '').trim();

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
