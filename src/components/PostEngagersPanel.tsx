import { useState } from 'react';
import { ThumbsUp, MessageCircle, ExternalLink, ChevronDown, ChevronUp, Users } from 'lucide-react';
import { usePostReactors, PostReactor } from '@/hooks/usePostReactors';
import { usePostCommenters, PostComment } from '@/hooks/usePostCommenters';
import { cn } from '@/lib/utils';
import { getRelativeTime } from '@/lib/timeUtils';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

const reactionEmojis: Record<string, string> = {
  like: '👍',
  celebrate: '👏',
  support: '💚',
  love: '❤️',
  insightful: '💡',
  curious: '🤔',
};

interface PostEngagersPanelProps {
  postId: string;
  totalReactions?: number;
  totalComments?: number;
  className?: string;
}

export function PostEngagersPanel({ postId, totalReactions = 0, totalComments = 0, className }: PostEngagersPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const { data: reactors = [], isLoading: loadingReactors } = usePostReactors(isOpen ? postId : undefined);
  const { data: commenters = [], isLoading: loadingComments } = usePostCommenters(isOpen ? postId : undefined);

  if (totalReactions === 0 && totalComments === 0) return null;

  return (
    <div className={cn('border-t border-border', className)}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-4 py-2 text-xs text-muted-foreground hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-1.5">
          <Users className="h-3 w-3" />
          <span>Who engaged</span>
        </div>
        {isOpen ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
      </button>

      {isOpen && (
        <div className="px-4 pb-3">
          <Tabs defaultValue="reactors" className="w-full">
            <TabsList className="w-full h-8">
              <TabsTrigger value="reactors" className="text-xs flex-1 gap-1">
                <ThumbsUp className="h-3 w-3" />
                Reactions {reactors.length > 0 && `(${reactors.length})`}
              </TabsTrigger>
              <TabsTrigger value="comments" className="text-xs flex-1 gap-1">
                <MessageCircle className="h-3 w-3" />
                Comments {commenters.length > 0 && `(${commenters.length})`}
              </TabsTrigger>
            </TabsList>

            <TabsContent value="reactors" className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {loadingReactors ? (
                <p className="text-xs text-muted-foreground py-2">Loading...</p>
              ) : reactors.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">No reactor data yet. Sync to fetch.</p>
              ) : (
                reactors.map((r) => (
                  <ReactorRow key={r.id} reactor={r} />
                ))
              )}
            </TabsContent>

            <TabsContent value="comments" className="mt-2 max-h-48 overflow-y-auto space-y-1">
              {loadingComments ? (
                <p className="text-xs text-muted-foreground py-2">Loading...</p>
              ) : commenters.length === 0 ? (
                <p className="text-xs text-muted-foreground py-2">Comments data requires additional LinkedIn permissions.</p>
              ) : (
                commenters.map((c) => (
                  <CommenterRow key={c.id} comment={c} />
                ))
              )}
            </TabsContent>
          </Tabs>
        </div>
      )}
    </div>
  );
}

function ReactorRow({ reactor }: { reactor: PostReactor }) {
  const emoji = reactionEmojis[reactor.reaction_type] || '👍';

  return (
    <div className="flex items-center gap-2 py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
      <span className="text-sm">{emoji}</span>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1">
          <span className="text-xs font-medium truncate">{reactor.actor_name}</span>
          {reactor.actor_profile_url && (
            <a
              href={reactor.actor_profile_url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary"
            >
              <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
        {reactor.actor_headline && (
          <p className="text-[10px] text-muted-foreground truncate">{reactor.actor_headline}</p>
        )}
      </div>
    </div>
  );
}

function CommenterRow({ comment }: { comment: PostComment }) {
  return (
    <div className="py-1.5 px-2 rounded-md hover:bg-muted/40 transition-colors">
      <div className="flex items-center gap-1">
        <span className="text-xs font-medium truncate">{comment.author_name || 'LinkedIn Member'}</span>
        {comment.author_profile_url && (
          <a
            href={comment.author_profile_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-muted-foreground hover:text-primary"
          >
            <ExternalLink className="h-2.5 w-2.5" />
          </a>
        )}
        {comment.commented_at && (
          <span className="text-[10px] text-muted-foreground ml-auto">
            {getRelativeTime(comment.commented_at)}
          </span>
        )}
      </div>
      {comment.author_headline && (
        <p className="text-[10px] text-muted-foreground truncate">{comment.author_headline}</p>
      )}
      {comment.content && (
        <p className="text-xs text-foreground mt-0.5 line-clamp-2">{comment.content}</p>
      )}
    </div>
  );
}
