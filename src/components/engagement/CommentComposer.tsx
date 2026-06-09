import { useState } from 'react';
import { EngagementPost, usePostComment } from '@/hooks/useEngagement';
import { Publisher } from '@/hooks/usePublishers';
import { supabase } from '@/integrations/supabase/client';
import { Card } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Sparkles, Send } from 'lucide-react';
import { toast } from 'sonner';

interface CommentComposerProps {
  post: EngagementPost;
  publisher: Publisher;
  onClose: () => void;
}

export function CommentComposer({ post, publisher, onClose }: CommentComposerProps) {
  const [commentText, setCommentText] = useState('');
  const [isGenerating, setIsGenerating] = useState(false);
  const { saveDraft, postComment } = usePostComment();

  const handleGenerate = async () => {
    if (!post.content) {
      toast.error('Post has no text content to base a comment on');
      return;
    }

    setIsGenerating(true);
    try {
      const prompt = `You are ${publisher.name}${publisher.headline ? `, ${publisher.headline}` : ''}${publisher.company_name ? ` at ${publisher.company_name}` : ''}.

Write a short, genuine LinkedIn comment (2-3 sentences max) on this post. Be conversational, add value or share a relevant perspective. Do NOT be generic or sycophantic. Do NOT use emojis excessively. Sound like a real person, not a bot.

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

      // The create-document function returns { title, content }
      // Extract just the text, stripping any "Post 1" markers
      let generated = data?.content || '';
      generated = generated.replace(/^(#{1,3}\s*)?Post\s*\d+[:\s]*/i, '').trim();
      // Remove any title line if present
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
      // Save as draft first
      const draft = await saveDraft.mutateAsync({
        publisher_id: publisher.id,
        post_id: post.id,
        comment_text: commentText.trim(),
      });

      // Then post to LinkedIn
      await postComment.mutateAsync({
        engagement_comment_id: draft.id,
        publisher_id: publisher.id,
        post_id: post.id,
        comment_text: commentText.trim(),
      });

      setCommentText('');
      onClose();
    } catch {
      // Error already handled by hook toasts
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

  return (
    <Card className="p-3 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-muted-foreground">
          Comment as {publisher.name}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 text-xs"
          disabled={isGenerating || !post.content}
          onClick={handleGenerate}
        >
          {isGenerating ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Sparkles className="h-3 w-3" />
          )}
          {isGenerating ? 'Generating...' : 'AI Suggest'}
        </Button>
      </div>

      <Textarea
        value={commentText}
        onChange={(e) => setCommentText(e.target.value)}
        placeholder="Write a comment..."
        rows={3}
        className="text-sm"
      />

      <div className="flex items-center justify-end gap-2">
        <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="outline" size="sm" className="h-7 text-xs" onClick={handleSaveDraft} disabled={!commentText.trim()}>
          Save Draft
        </Button>
        <Button size="sm" className="h-7 text-xs gap-1" onClick={handlePost} disabled={!commentText.trim() || postComment.isPending}>
          {postComment.isPending ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : (
            <Send className="h-3 w-3" />
          )}
          Post to LinkedIn
        </Button>
      </div>
    </Card>
  );
}
