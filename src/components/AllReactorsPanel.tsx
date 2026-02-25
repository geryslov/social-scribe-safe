import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink, Sparkles, Users, ThumbsUp, MessageCircle, BarChart3 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EngagerInsights } from '@/components/EngagerInsights';

interface Reactor {
  id: string;
  actor_name: string;
  actor_headline: string | null;
  actor_profile_url: string | null;
  actor_avatar_url: string | null;
  reaction_type: string;
  post_id: string;
}

interface Comment {
  id: string;
  author_name: string | null;
  author_headline: string | null;
  author_profile_url: string | null;
  author_avatar_url: string | null;
  post_id: string;
}

interface AggregatedProfile {
  name: string;
  headline: string | null;
  profileUrl: string | null;
  avatarUrl: string | null;
  reactionsCount: number;
  commentsCount: number;
  totalEngagements: number;
  reactionTypes: Record<string, number>;
}

const reactionEmojis: Record<string, string> = {
  like: '👍', celebrate: '👏', praise: '👏', support: '💚',
  love: '❤️', insightful: '💡', interest: '💡', curious: '🤔',
};

function EngagerAvatar({ name, avatarUrl }: { name: string; avatarUrl?: string | null }) {
  const initials = name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();

  if (avatarUrl) {
    return (
      <img src={avatarUrl} alt={name}
        className="w-9 h-9 rounded-full object-cover ring-2 ring-background shadow-sm"
      />
    );
  }

  return (
    <div className="w-9 h-9 rounded-full flex items-center justify-center text-[11px] font-semibold ring-2 ring-background shadow-sm bg-gradient-to-br from-primary/20 to-accent/20 text-primary">
      {initials || '?'}
    </div>
  );
}

interface AllReactorsPanelProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  postIds: string[];
  title?: string;
}

export function AllReactorsPanel({ open, onOpenChange, postIds, title = 'All Engagers' }: AllReactorsPanelProps) {
  const [filter, setFilter] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'profiles' | 'insights'>('profiles');

  const { data: reactors = [], isLoading: loadingReactors } = useQuery({
    queryKey: ['all-reactors', postIds],
    queryFn: async () => {
      if (postIds.length === 0) return [];
      const allReactors: Reactor[] = [];
      for (let i = 0; i < postIds.length; i += 50) {
        const batch = postIds.slice(i, i + 50);
        const { data, error } = await supabase
          .from('post_reactors')
          .select('id, actor_name, actor_headline, actor_profile_url, actor_avatar_url, reaction_type, post_id')
          .in('post_id', batch)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data) allReactors.push(...(data as unknown as Reactor[]));
      }
      return allReactors;
    },
    enabled: open && postIds.length > 0,
  });

  const { data: comments = [], isLoading: loadingComments } = useQuery({
    queryKey: ['all-commenters', postIds],
    queryFn: async () => {
      if (postIds.length === 0) return [];
      const allComments: Comment[] = [];
      for (let i = 0; i < postIds.length; i += 50) {
        const batch = postIds.slice(i, i + 50);
        const { data, error } = await supabase
          .from('post_comments')
          .select('id, author_name, author_headline, author_profile_url, author_avatar_url, post_id')
          .in('post_id', batch)
          .order('created_at', { ascending: false });
        if (error) throw error;
        if (data) allComments.push(...(data as unknown as Comment[]));
      }
      return allComments;
    },
    enabled: open && postIds.length > 0,
  });

  const isLoading = loadingReactors || loadingComments;

  // Build aggregated profiles
  const profiles = useMemo(() => {
    const map = new Map<string, AggregatedProfile>();

    for (const r of reactors) {
      const key = r.actor_name;
      if (!map.has(key)) {
        map.set(key, {
          name: r.actor_name,
          headline: r.actor_headline,
          profileUrl: r.actor_profile_url,
          avatarUrl: r.actor_avatar_url,
          reactionsCount: 0,
          commentsCount: 0,
          totalEngagements: 0,
          reactionTypes: {},
        });
      }
      const p = map.get(key)!;
      p.reactionsCount += 1;
      p.totalEngagements += 1;
      const type = r.reaction_type || 'like';
      p.reactionTypes[type] = (p.reactionTypes[type] || 0) + 1;
      // Update profile info if better data available
      if (!p.avatarUrl && r.actor_avatar_url) p.avatarUrl = r.actor_avatar_url;
      if (!p.headline && r.actor_headline) p.headline = r.actor_headline;
      if (!p.profileUrl && r.actor_profile_url) p.profileUrl = r.actor_profile_url;
    }

    for (const c of comments) {
      const key = c.author_name || 'LinkedIn Member';
      if (!map.has(key)) {
        map.set(key, {
          name: key,
          headline: c.author_headline,
          profileUrl: c.author_profile_url,
          avatarUrl: c.author_avatar_url,
          reactionsCount: 0,
          commentsCount: 0,
          totalEngagements: 0,
          reactionTypes: {},
        });
      }
      const p = map.get(key)!;
      p.commentsCount += 1;
      p.totalEngagements += 1;
      if (!p.avatarUrl && c.author_avatar_url) p.avatarUrl = c.author_avatar_url;
      if (!p.headline && c.author_headline) p.headline = c.author_headline;
      if (!p.profileUrl && c.author_profile_url) p.profileUrl = c.author_profile_url;
    }

    return Array.from(map.values()).sort((a, b) => b.totalEngagements - a.totalEngagements);
  }, [reactors, comments]);

  // Filter options
  const filtered = useMemo(() => {
    if (!filter) return profiles;
    if (filter === 'comments') return profiles.filter(p => p.commentsCount > 0);
    if (filter === 'reactions') return profiles.filter(p => p.reactionsCount > 0);
    // Specific reaction type
    return profiles.filter(p => (p.reactionTypes[filter] || 0) > 0);
  }, [profiles, filter]);

  // Chip data
  const totalReactions = reactors.length;
  const totalComments = comments.length;
  const reactionTypeCounts = useMemo(() => {
    const acc: Record<string, number> = {};
    for (const r of reactors) {
      const type = r.reaction_type || 'like';
      acc[type] = (acc[type] || 0) + 1;
    }
    return Object.entries(acc).sort((a, b) => b[1] - a[1]);
  }, [reactors]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {title}
            <span className="text-sm font-normal text-muted-foreground">
              ({profiles.length} profiles)
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* View mode toggle */}
        <div className="flex gap-1 p-0.5 bg-muted/50 rounded-lg w-fit">
          <button
            onClick={() => setViewMode('profiles')}
            className={cn(
              'px-3 py-1 rounded-md text-[11px] font-medium transition-colors',
              viewMode === 'profiles' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Users className="h-3 w-3 inline mr-1" />
            Profiles
          </button>
          <button
            onClick={() => setViewMode('insights')}
            className={cn(
              'px-3 py-1 rounded-md text-[11px] font-medium transition-colors',
              viewMode === 'insights' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <BarChart3 className="h-3 w-3 inline mr-1" />
            Insights
          </button>
        </div>

        {viewMode === 'insights' ? (
          <div className="flex-1 overflow-y-auto -mx-2 px-2 pb-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-10">
                <Sparkles className="h-4 w-4 text-primary animate-pulse mr-2" />
                <span className="text-sm text-muted-foreground">Analyzing profiles...</span>
              </div>
            ) : (
              <EngagerInsights
                engagers={profiles.map(p => ({ headline: p.headline }))}
              />
            )}
          </div>
        ) : (
        <>
        {/* Filter chips */}
        <div className="flex flex-wrap gap-1.5 pb-2">
          <button
            onClick={() => setFilter(null)}
            className={cn(
              'px-2 py-1 rounded-full text-[11px] font-medium border transition-colors',
              !filter
                ? 'bg-primary/10 border-primary/30 text-primary'
                : 'bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground'
            )}
          >
            All ({profiles.length})
          </button>
          {totalReactions > 0 && (
            <button
              onClick={() => setFilter(filter === 'reactions' ? null : 'reactions')}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition-colors',
                filter === 'reactions'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground'
              )}
            >
              <ThumbsUp className="h-3 w-3" />
              {totalReactions}
            </button>
          )}
          {totalComments > 0 && (
            <button
              onClick={() => setFilter(filter === 'comments' ? null : 'comments')}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition-colors',
                filter === 'comments'
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground'
              )}
            >
              <MessageCircle className="h-3 w-3" />
              {totalComments}
            </button>
          )}
          {reactionTypeCounts.map(([type, count]) => (
            <button
              key={type}
              onClick={() => setFilter(filter === type ? null : type)}
              className={cn(
                'inline-flex items-center gap-1 px-2 py-1 rounded-full text-[11px] font-medium border transition-colors',
                filter === type
                  ? 'bg-primary/10 border-primary/30 text-primary'
                  : 'bg-muted/50 border-border/50 text-muted-foreground hover:text-foreground'
              )}
            >
              <span>{reactionEmojis[type] || '👍'}</span>
              {count}
            </button>
          ))}
        </div>

        {/* Profile list */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Sparkles className="h-4 w-4 text-primary animate-pulse mr-2" />
              <span className="text-sm text-muted-foreground">Loading profiles...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No engagement data available</p>
            </div>
          ) : (
            filtered.map((p) => (
              <a
                key={p.name}
                href={p.profileUrl || '#'}
                target={p.profileUrl ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg transition-all group',
                  'hover:bg-primary/5',
                  p.profileUrl ? 'cursor-pointer' : 'cursor-default'
                )}
              >
                <EngagerAvatar name={p.name} avatarUrl={p.avatarUrl} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {p.name}
                    </span>
                    {p.profileUrl && (
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-primary/60 transition-all flex-shrink-0" />
                    )}
                  </div>
                  {p.headline && (
                    <p className="text-[11px] text-muted-foreground truncate leading-tight">
                      {p.headline}
                    </p>
                  )}
                </div>
                {/* Engagement badges */}
                <div className="flex items-center gap-1 flex-shrink-0">
                  {p.reactionsCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                      <ThumbsUp className="h-2.5 w-2.5" />
                      {p.reactionsCount}
                    </span>
                  )}
                  {p.commentsCount > 0 && (
                    <span className="inline-flex items-center gap-0.5 text-[10px] font-semibold font-mono bg-accent/20 text-accent-foreground px-1.5 py-0.5 rounded-full">
                      <MessageCircle className="h-2.5 w-2.5" />
                      {p.commentsCount}
                    </span>
                  )}
                </div>
              </a>
            ))
          )}
        </div>
        </>
        )}
      </DialogContent>
    </Dialog>
  );
}
