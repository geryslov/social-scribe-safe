import { useState } from 'react';
import { ThumbsUp, MessageCircle, ExternalLink, ChevronDown, ChevronUp, Users, Sparkles } from 'lucide-react';
import { usePostReactors, PostReactor } from '@/hooks/usePostReactors';
import { usePostCommenters, PostComment } from '@/hooks/usePostCommenters';
import { cn } from '@/lib/utils';
import { getRelativeTime } from '@/lib/timeUtils';

const reactionEmojis: Record<string, string> = {
  like: '👍',
  celebrate: '👏',
  praise: '👏',
  support: '💚',
  love: '❤️',
  insightful: '💡',
  interest: '💡',
  curious: '🤔',
};

const reactionLabels: Record<string, string> = {
  like: 'Like',
  celebrate: 'Celebrate',
  praise: 'Celebrate',
  support: 'Support',
  love: 'Love',
  insightful: 'Insightful',
  interest: 'Insightful',
  curious: 'Curious',
};

interface PostEngagersPanelProps {
  postId: string;
  totalReactions?: number;
  totalComments?: number;
  className?: string;
}

function EngagerAvatar({ name, avatarUrl, size = 'sm' }: { name: string; avatarUrl?: string | null; size?: 'sm' | 'md' }) {
  const initials = name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const sizeClasses = size === 'md' ? 'w-10 h-10 text-xs' : 'w-8 h-8 text-[10px]';

  if (avatarUrl) {
    return (
      <img
        src={avatarUrl}
        alt={name}
        className={cn(sizeClasses, 'rounded-full object-cover ring-2 ring-background shadow-sm')}
        onError={(e) => {
          // Fallback to initials on error
          (e.target as HTMLImageElement).style.display = 'none';
          (e.target as HTMLImageElement).nextElementSibling?.classList.remove('hidden');
        }}
      />
    );
  }

  return (
    <div className={cn(
      sizeClasses,
      'rounded-full flex items-center justify-center font-semibold ring-2 ring-background shadow-sm',
      'bg-gradient-to-br from-primary/20 to-accent/20 text-primary'
    )}>
      {initials || '?'}
    </div>
  );
}

export function PostEngagersPanel({ postId, totalReactions = 0, totalComments = 0, className }: PostEngagersPanelProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<'reactors' | 'comments'>('reactors');
  const { data: reactors = [], isLoading: loadingReactors } = usePostReactors(isOpen ? postId : undefined);
  const { data: commenters = [], isLoading: loadingComments } = usePostCommenters(isOpen ? postId : undefined);

  if (totalReactions === 0 && totalComments === 0) return null;

  // Group reactors by reaction type
  const groupedReactors = reactors.reduce((acc, r) => {
    const type = r.reaction_type || 'like';
    if (!acc[type]) acc[type] = [];
    acc[type].push(r);
    return acc;
  }, {} as Record<string, PostReactor[]>);

  const sortedGroups = Object.entries(groupedReactors).sort((a, b) => b[1].length - a[1].length);

  return (
    <div className={cn('border-t border-border', className)}>
      {/* Toggle Button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          'w-full flex items-center justify-between px-4 py-2.5 text-xs transition-all duration-200',
          isOpen
            ? 'bg-primary/5 text-primary border-b border-primary/10'
            : 'text-muted-foreground hover:bg-muted/30 hover:text-foreground'
        )}
      >
        <div className="flex items-center gap-2">
          <div className={cn(
            'w-5 h-5 rounded-full flex items-center justify-center transition-colors',
            isOpen ? 'bg-primary/10' : 'bg-muted/50'
          )}>
            <Users className="h-3 w-3" />
          </div>
          <span className="font-medium">Who engaged</span>
          {reactors.length > 0 && (
            <span className="px-1.5 py-0.5 rounded-full bg-primary/10 text-primary text-[10px] font-semibold">
              {reactors.length}
            </span>
          )}
        </div>
        {isOpen ? <ChevronUp className="h-3.5 w-3.5" /> : <ChevronDown className="h-3.5 w-3.5" />}
      </button>

      {/* Panel Content */}
      {isOpen && (
        <div className="animate-fade-in">
          {/* Tab Bar */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('reactors')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all relative',
                activeTab === 'reactors'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <ThumbsUp className="h-3.5 w-3.5" />
              Reactions {reactors.length > 0 && `(${reactors.length})`}
              {activeTab === 'reactors' && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
              )}
            </button>
            <button
              onClick={() => setActiveTab('comments')}
              className={cn(
                'flex-1 flex items-center justify-center gap-1.5 px-3 py-2.5 text-xs font-medium transition-all relative',
                activeTab === 'comments'
                  ? 'text-primary'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <MessageCircle className="h-3.5 w-3.5" />
              Comments {commenters.length > 0 && `(${commenters.length})`}
              {activeTab === 'comments' && (
                <span className="absolute bottom-0 left-2 right-2 h-0.5 rounded-full bg-primary" />
              )}
            </button>
          </div>

          {/* Reactors Tab */}
          {activeTab === 'reactors' && (
            <div className="p-3 max-h-80 overflow-y-auto">
              {loadingReactors ? (
                <div className="flex items-center justify-center py-6">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse mr-2" />
                  <span className="text-xs text-muted-foreground">Loading engagers...</span>
                </div>
              ) : reactors.length === 0 ? (
                <div className="text-center py-6">
                  <Users className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">No reactor data yet. Sync to fetch.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {sortedGroups.map(([type, typeReactors]) => (
                    <div key={type}>
                      {/* Reaction type header */}
                      <div className="flex items-center gap-2 mb-2">
                        <span className="text-base">{reactionEmojis[type] || '👍'}</span>
                        <span className="text-[11px] font-semibold text-foreground">
                          {reactionLabels[type] || type}
                        </span>
                        <span className="text-[10px] text-muted-foreground">
                          ({typeReactors.length})
                        </span>
                        <div className="flex-1 h-px bg-border" />
                      </div>
                      
                      {/* Reactor cards */}
                      <div className="grid gap-1.5">
                        {typeReactors.map((r) => (
                          <ReactorCard key={r.id} reactor={r} />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Comments Tab */}
          {activeTab === 'comments' && (
            <div className="p-3 max-h-80 overflow-y-auto">
              {loadingComments ? (
                <div className="flex items-center justify-center py-6">
                  <Sparkles className="h-4 w-4 text-primary animate-pulse mr-2" />
                  <span className="text-xs text-muted-foreground">Loading comments...</span>
                </div>
              ) : commenters.length === 0 ? (
                <div className="text-center py-6">
                  <MessageCircle className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
                  <p className="text-xs text-muted-foreground">Comments data requires additional LinkedIn permissions.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {commenters.map((c) => (
                    <CommenterCard key={c.id} comment={c} />
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReactorCard({ reactor }: { reactor: PostReactor }) {
  return (
    <a
      href={reactor.actor_profile_url || '#'}
      target={reactor.actor_profile_url ? '_blank' : undefined}
      rel="noopener noreferrer"
      className={cn(
        'flex items-center gap-3 p-2.5 rounded-lg transition-all duration-150 group',
        'hover:bg-primary/5 hover:shadow-sm',
        reactor.actor_profile_url ? 'cursor-pointer' : 'cursor-default'
      )}
    >
      <EngagerAvatar
        name={reactor.actor_name}
        avatarUrl={reactor.actor_avatar_url}
        size="sm"
      />
      
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-semibold text-foreground truncate group-hover:text-primary transition-colors">
            {reactor.actor_name}
          </span>
          {reactor.actor_profile_url && (
            <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-primary/60 transition-all flex-shrink-0" />
          )}
        </div>
        {reactor.actor_headline && (
          <p className="text-[10px] text-muted-foreground truncate leading-tight mt-0.5">
            {reactor.actor_headline}
          </p>
        )}
      </div>
    </a>
  );
}

function CommenterCard({ comment }: { comment: PostComment }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30 border border-border/50 hover:border-primary/20 transition-all">
      <div className="flex items-start gap-2.5">
        <EngagerAvatar
          name={comment.author_name || 'LinkedIn Member'}
          avatarUrl={comment.author_avatar_url}
          size="sm"
        />
        
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5">
            {comment.author_profile_url ? (
              <a
                href={comment.author_profile_url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-xs font-semibold text-foreground hover:text-primary transition-colors truncate"
              >
                {comment.author_name || 'LinkedIn Member'}
              </a>
            ) : (
              <span className="text-xs font-semibold text-foreground truncate">
                {comment.author_name || 'LinkedIn Member'}
              </span>
            )}
            {comment.commented_at && (
              <span className="text-[10px] text-muted-foreground ml-auto flex-shrink-0">
                {getRelativeTime(comment.commented_at)}
              </span>
            )}
          </div>
          {comment.author_headline && (
            <p className="text-[10px] text-muted-foreground truncate mt-0.5">{comment.author_headline}</p>
          )}
          {comment.content && (
            <p className="text-[11px] text-foreground mt-1.5 leading-relaxed line-clamp-3">
              {comment.content}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
