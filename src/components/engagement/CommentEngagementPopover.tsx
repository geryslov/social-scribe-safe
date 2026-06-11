import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover';
import { ThumbsUp, MessageSquare, ExternalLink, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

interface CommentReactor {
  id: string;
  actor_name: string;
  actor_headline: string | null;
  actor_profile_url: string | null;
  actor_avatar_url: string | null;
  reaction_type: string;
  reacted_at: string | null;
}

interface CommentReply {
  id: string;
  actor_name: string;
  actor_headline: string | null;
  actor_profile_url: string | null;
  actor_avatar_url: string | null;
  reply_text: string | null;
  replied_at: string | null;
}

interface CommentEngagementPopoverProps {
  engagementCommentId: string;
  reactionCount: number;
  replyCount: number;
  commentText?: string;
  postedAt?: string | null;
}

export function CommentEngagementPopover({
  engagementCommentId,
  reactionCount,
  replyCount,
  commentText,
  postedAt,
}: CommentEngagementPopoverProps) {
  const enabled = reactionCount > 0 || replyCount > 0;

  const { data, isLoading } = useQuery({
    queryKey: ['comment-engagement-detail', engagementCommentId],
    enabled,
    queryFn: async () => {
      const [reactorsRes, repliesRes] = await Promise.all([
        (supabase as any)
          .from('comment_reactors')
          .select('id, actor_name, actor_headline, actor_profile_url, actor_avatar_url, reaction_type, reacted_at')
          .eq('engagement_comment_id', engagementCommentId)
          .order('reacted_at', { ascending: false }),
        (supabase as any)
          .from('comment_replies')
          .select('id, actor_name, actor_headline, actor_profile_url, actor_avatar_url, reply_text, replied_at')
          .eq('engagement_comment_id', engagementCommentId)
          .order('replied_at', { ascending: false }),
      ]);
      return {
        reactors: (reactorsRes.data || []) as CommentReactor[],
        replies: (repliesRes.data || []) as CommentReply[],
      };
    },
  });

  if (!enabled && !commentText) return null;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-2 rounded-md px-1.5 py-0.5 hover:bg-muted/60 transition-colors"
          title="See your comment, reactors and replies"
        >
          {reactionCount > 0 && (
            <span className="text-[10px] font-medium text-amber-600 flex items-center gap-0.5">
              <ThumbsUp className="h-2.5 w-2.5" />
              {reactionCount}
            </span>
          )}
          {replyCount > 0 && (
            <span className="text-[10px] font-medium text-sky-600 flex items-center gap-0.5">
              <MessageSquare className="h-2.5 w-2.5" />
              {replyCount}
            </span>
          )}
          {reactionCount === 0 && replyCount === 0 && (
            <span className="text-[10px] font-medium text-muted-foreground">View comment</span>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="start">
        <div className="max-h-[480px] overflow-y-auto">
          {commentText && (
            <section className="border-b bg-emerald-50/40 px-3 py-2.5">
              <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 mb-1">
                Your comment{postedAt ? ` · ${new Date(postedAt).toLocaleDateString()}` : ''}
              </p>
              <p className="text-xs text-foreground/85 whitespace-pre-wrap">{commentText}</p>
            </section>
          )}
          {isLoading ? (
            <div className="p-6 flex justify-center">
              <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
            </div>
          ) : (
            <>
              {/* Reactors */}
              <section className="border-b">
                <header className="px-3 py-2 flex items-center gap-2 bg-muted/40">
                  <ThumbsUp className="h-3.5 w-3.5 text-amber-600" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Reactions ({reactionCount})
                  </span>
                </header>
                {data?.reactors.length === 0 ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    Detail unavailable — LinkedIn returned an aggregate count only.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {data?.reactors.map((r) => (
                      <ActorRow
                        key={r.id}
                        name={r.actor_name}
                        headline={r.actor_headline}
                        profileUrl={r.actor_profile_url}
                        avatarUrl={r.actor_avatar_url}
                        meta={r.reaction_type.toLowerCase()}
                      />
                    ))}
                  </ul>
                )}
              </section>

              {/* Replies */}
              <section>
                <header className="px-3 py-2 flex items-center gap-2 bg-muted/40">
                  <MessageSquare className="h-3.5 w-3.5 text-sky-600" />
                  <span className="text-xs font-semibold uppercase tracking-wide">
                    Replies ({replyCount})
                  </span>
                </header>
                {(!data?.replies || data.replies.length === 0) ? (
                  <p className="px-3 py-3 text-xs text-muted-foreground">
                    No replies synced yet.
                  </p>
                ) : (
                  <ul className="divide-y">
                    {data.replies.map((r) => (
                      <li key={r.id} className="px-3 py-2.5 space-y-1.5">
                        <ActorRow
                          name={r.actor_name}
                          headline={r.actor_headline}
                          profileUrl={r.actor_profile_url}
                          avatarUrl={r.actor_avatar_url}
                          dense
                        />
                        {r.reply_text && (
                          <p className="text-xs text-foreground/85 whitespace-pre-wrap pl-9">
                            {r.reply_text}
                          </p>
                        )}
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

function ActorRow({
  name, headline, profileUrl, avatarUrl, meta, dense,
}: {
  name: string;
  headline: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  meta?: string;
  dense?: boolean;
}) {
  const initials = name.split(' ').map((s) => s[0]).slice(0, 2).join('').toUpperCase();
  return (
    <div className={cn('flex items-center gap-2.5', dense ? '' : 'px-3 py-2')}>
      <div className="h-7 w-7 shrink-0 rounded-full bg-muted overflow-hidden flex items-center justify-center text-[10px] font-semibold text-muted-foreground">
        {avatarUrl ? (
          <img src={avatarUrl} alt={name} className="h-full w-full object-cover" />
        ) : (
          initials
        )}
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium truncate">{name}</span>
          {profileUrl && (
            <a href={profileUrl} target="_blank" rel="noopener noreferrer" className="text-muted-foreground hover:text-primary">
              <ExternalLink className="h-3 w-3" />
            </a>
          )}
        </div>
        {headline && (
          <p className="text-[10px] text-muted-foreground truncate">{headline}</p>
        )}
      </div>
      {meta && (
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">{meta}</span>
      )}
    </div>
  );
}
