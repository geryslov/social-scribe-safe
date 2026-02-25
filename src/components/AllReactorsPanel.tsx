import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ExternalLink, Sparkles, Users } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Reactor {
  id: string;
  actor_name: string;
  actor_headline: string | null;
  actor_profile_url: string | null;
  actor_avatar_url: string | null;
  reaction_type: string;
  post_id: string;
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

export function AllReactorsPanel({ open, onOpenChange, postIds, title = 'All Reactors' }: AllReactorsPanelProps) {
  const [filter, setFilter] = useState<string | null>(null);

  const { data: reactors = [], isLoading } = useQuery({
    queryKey: ['all-reactors', postIds],
    queryFn: async () => {
      if (postIds.length === 0) return [];
      
      // Fetch in batches of 50 post IDs
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

  // Dedupe by name, keep first occurrence, count total reactions per person
  const { deduped, counts } = reactors.reduce((acc, r) => {
    if (!acc.seen.has(r.actor_name)) {
      acc.seen.add(r.actor_name);
      acc.deduped.push(r);
      acc.counts[r.actor_name] = 1;
    } else {
      acc.counts[r.actor_name] += 1;
    }
    return acc;
  }, { seen: new Set<string>(), deduped: [] as Reactor[], counts: {} as Record<string, number> });

  // Group by reaction type for filter chips
  const typeCounts = reactors.reduce((acc, r) => {
    const type = r.reaction_type || 'like';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const sortedTypes = Object.entries(typeCounts).sort((a, b) => b[1] - a[1]);
  const filtered = filter
    ? deduped.filter(r => r.reaction_type === filter)
    : deduped;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Users className="h-4 w-4 text-primary" />
            {title}
            <span className="text-sm font-normal text-muted-foreground">
              ({deduped.length} profiles, {reactors.length} reactions)
            </span>
          </DialogTitle>
        </DialogHeader>

        {/* Filter chips */}
        {sortedTypes.length > 1 && (
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
              All ({reactors.length})
            </button>
            {sortedTypes.map(([type, count]) => (
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
        )}

        {/* Reactor list */}
        <div className="flex-1 overflow-y-auto -mx-2 px-2 space-y-1">
          {isLoading ? (
            <div className="flex items-center justify-center py-10">
              <Sparkles className="h-4 w-4 text-primary animate-pulse mr-2" />
              <span className="text-sm text-muted-foreground">Loading profiles...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <Users className="h-8 w-8 mx-auto mb-2 opacity-30" />
              <p className="text-sm">No reactor data available</p>
            </div>
          ) : (
            filtered.map((r) => (
              <a
                key={r.id}
                href={r.actor_profile_url || '#'}
                target={r.actor_profile_url ? '_blank' : undefined}
                rel="noopener noreferrer"
                className={cn(
                  'flex items-center gap-3 p-2 rounded-lg transition-all group',
                  'hover:bg-primary/5',
                  r.actor_profile_url ? 'cursor-pointer' : 'cursor-default'
                )}
              >
                <EngagerAvatar name={r.actor_name} avatarUrl={r.actor_avatar_url} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">
                      {r.actor_name}
                    </span>
                    <span className="text-sm flex-shrink-0">{reactionEmojis[r.reaction_type] || '👍'}</span>
                    {r.actor_profile_url && (
                      <ExternalLink className="h-2.5 w-2.5 text-muted-foreground/0 group-hover:text-primary/60 transition-all flex-shrink-0" />
                    )}
                  </div>
                  {r.actor_headline && (
                    <p className="text-[11px] text-muted-foreground truncate leading-tight">
                      {r.actor_headline}
                    </p>
                  )}
                </div>
                <span className="text-[10px] text-primary font-mono bg-primary/10 px-1.5 py-0.5 rounded-full font-semibold flex-shrink-0">
                  ×{counts[r.actor_name] || 1}
                </span>
              </a>
            ))
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
