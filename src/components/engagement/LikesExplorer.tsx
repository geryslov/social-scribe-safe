import { useMemo, useState } from 'react';
import { Heart, ExternalLink, MessageCircle, FileText, Users, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input } from '@/components/ui/input';
import { useLikesHistory, LikeToday } from '@/hooks/useEngagementActivity';
import { getRelativeTime } from '@/lib/timeUtils';

type RangeId = 'today' | '7' | '30' | '90';
type TypeId = 'all' | 'post' | 'comment';
type GroupId = 'profile' | 'date';

const RANGES: { id: RangeId; label: string; days: number }[] = [
  { id: 'today', label: 'Today', days: 1 },
  { id: '7', label: 'Last 7 days', days: 7 },
  { id: '30', label: 'Last 30 days', days: 30 },
  { id: '90', label: 'Last 90 days', days: 90 },
];

function dayKey(iso: string) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const diff = Math.round((today.getTime() - d.getTime()) / 86400000);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' });
}

function LikeItem({ like }: { like: LikeToday }) {
  return (
    <li className="px-4 py-2.5 hover:bg-[#F7F8FB]">
      <div className="flex items-start gap-2">
        {like.kind === 'post'
          ? <FileText className="h-3.5 w-3.5 text-[#7C3AED] mt-0.5 flex-shrink-0" />
          : <MessageCircle className="h-3.5 w-3.5 text-[#0E9F8E] mt-0.5 flex-shrink-0" />}
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-[#171923] truncate">{like.target_name || 'Unknown profile'}</span>
            <span className={cn(
              'text-[10px] font-medium px-1.5 rounded flex-shrink-0',
              like.kind === 'post' ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'bg-[#E6F7F5] text-[#0E9F8E]',
            )}>
              {like.kind === 'post' ? 'Post like' : 'Comment like'}
            </span>
            <span className="text-[11px] text-[#667085] tabular-nums flex-shrink-0 ml-auto">
              {new Date(like.liked_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
          {like.text && <p className="text-xs text-[#667085] mt-0.5 line-clamp-2 leading-snug">{like.text}</p>}
          {like.url && (
            <a href={like.url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 text-[11px] text-[#7C3AED] hover:underline">
              {like.kind === 'post' ? 'Open post' : 'Open thread'} <ExternalLink className="h-2.5 w-2.5" />
            </a>
          )}
        </div>
      </div>
    </li>
  );
}

export function LikesExplorer({ publisherId }: { publisherId: string }) {
  const [range, setRange] = useState<RangeId>('7');
  const [type, setType] = useState<TypeId>('all');
  const [group, setGroup] = useState<GroupId>('profile');
  const [query, setQuery] = useState('');
  const [open, setOpen] = useState<Record<string, boolean>>({});

  const days = RANGES.find((r) => r.id === range)!.days;
  const { data: likes = [], isLoading } = useLikesHistory(publisherId, days);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return likes.filter((l) => {
      if (type !== 'all' && l.kind !== type) return false;
      if (!q) return true;
      return (l.target_name || '').toLowerCase().includes(q) || (l.text || '').toLowerCase().includes(q);
    });
  }, [likes, type, query]);

  const postCount = filtered.filter((l) => l.kind === 'post').length;
  const commentCount = filtered.filter((l) => l.kind === 'comment').length;

  const groups = useMemo(() => {
    const map = new Map<string, { key: string; label: string; sub: string; items: LikeToday[] }>();
    for (const l of filtered) {
      const key = group === 'profile' ? (l.target_id || 'unknown') : dayKey(l.liked_at);
      if (!map.has(key)) {
        map.set(key, {
          key,
          label: group === 'profile' ? (l.target_name || 'Unknown profile') : dayLabel(l.liked_at),
          sub: group === 'profile' ? (l.target_linkedin_url || '') : '',
          items: [],
        });
      }
      map.get(key)!.items.push(l);
    }
    const arr = [...map.values()];
    if (group === 'profile') arr.sort((a, b) => b.items.length - a.items.length || a.label.localeCompare(b.label));
    else arr.sort((a, b) => new Date(b.key).getTime() - new Date(a.key).getTime());
    return arr;
  }, [filtered, group]);

  const profileCount = useMemo(() => new Set(filtered.map((l) => l.target_id)).size, [filtered]);

  return (
    <section className="rounded-[14px] border border-[#E5E7ED] bg-white overflow-hidden">
      <div className="px-5 pt-4 pb-3 border-b border-[#E5E7ED]">
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-sm font-semibold text-[#171923] flex items-center gap-2">
              <Heart className="h-4 w-4 text-rose-500" /> Likes
            </h2>
            <p className="text-xs text-[#667085] mt-0.5">
              Every profile this publisher liked — posts and comments, auto or manual.
            </p>
          </div>
          <div className="flex items-center gap-4 text-xs text-[#667085]">
            <span className="inline-flex items-center gap-1"><Users className="h-3.5 w-3.5" /> {profileCount} profiles</span>
            <span className="inline-flex items-center gap-1"><FileText className="h-3.5 w-3.5 text-[#7C3AED]" /> {postCount} posts</span>
            <span className="inline-flex items-center gap-1"><MessageCircle className="h-3.5 w-3.5 text-[#0E9F8E]" /> {commentCount} comments</span>
            <span className="font-semibold text-[#171923] tabular-nums">{filtered.length} total</span>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2 flex-wrap">
          <div className="inline-flex rounded-lg border border-[#E5E7ED] p-0.5 text-xs" role="tablist" aria-label="Date range">
            {RANGES.map((r) => (
              <button
                key={r.id}
                role="tab"
                aria-selected={range === r.id}
                onClick={() => setRange(r.id)}
                className={cn('px-2.5 h-7 rounded-md font-medium transition-colors',
                  range === r.id ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'text-[#667085] hover:text-[#171923]')}
              >{r.label}</button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-[#E5E7ED] p-0.5 text-xs" role="tablist" aria-label="Like type">
            {([['all', `All ${filtered.length}`], ['post', `Posts ${postCount}`], ['comment', `Comments ${commentCount}`]] as const).map(([id, label]) => (
              <button
                key={id}
                role="tab"
                aria-selected={type === id}
                onClick={() => setType(id as TypeId)}
                className={cn('px-2.5 h-7 rounded-md font-medium transition-colors',
                  type === id ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'text-[#667085] hover:text-[#171923]')}
              >{label}</button>
            ))}
          </div>

          <div className="inline-flex rounded-lg border border-[#E5E7ED] p-0.5 text-xs" role="group" aria-label="Group by">
            {([['profile', 'By profile'], ['date', 'By date']] as const).map(([id, label]) => (
              <button
                key={id}
                aria-pressed={group === id}
                onClick={() => setGroup(id as GroupId)}
                className={cn('px-2.5 h-7 rounded-md font-medium transition-colors',
                  group === id ? 'bg-[#F4F0FF] text-[#7C3AED]' : 'text-[#667085] hover:text-[#171923]')}
              >{label}</button>
            ))}
          </div>

          <div className="flex-1" />
          <Input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search profile or text"
            aria-label="Search likes"
            className="h-8 text-xs w-56 border-[#E5E7ED] bg-white"
          />
        </div>
      </div>

      {isLoading ? (
        <div className="p-10 text-center text-sm text-[#667085]">Loading likes…</div>
      ) : groups.length === 0 ? (
        <div className="p-10 text-center">
          <Heart className="h-6 w-6 text-[#E5E7ED] mx-auto mb-2" />
          <p className="text-xs text-[#667085]">No likes in this range.</p>
        </div>
      ) : (
        <ul className="divide-y divide-[#E5E7ED]">
          {groups.map((g) => {
            const isOpen = open[g.key] ?? group === 'date';
            const gPosts = g.items.filter((i) => i.kind === 'post').length;
            const gComments = g.items.length - gPosts;
            return (
              <li key={g.key}>
                <button
                  type="button"
                  onClick={() => setOpen((o) => ({ ...o, [g.key]: !isOpen }))}
                  aria-expanded={isOpen}
                  className="w-full flex items-center gap-3 px-5 h-11 text-left hover:bg-[#F7F8FB]"
                >
                  <ChevronDown className={cn('h-3.5 w-3.5 text-[#667085] transition-transform', !isOpen && '-rotate-90')} />
                  <span className="text-sm font-medium text-[#171923] truncate">{g.label}</span>
                  {group === 'profile' && g.sub && (
                    <a
                      href={g.sub}
                      target="_blank"
                      rel="noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      className="text-[11px] text-[#7C3AED] hover:underline inline-flex items-center gap-1"
                    >LinkedIn <ExternalLink className="h-2.5 w-2.5" /></a>
                  )}
                  <span className="ml-auto flex items-center gap-2 text-[11px] text-[#667085] tabular-nums">
                    {gPosts > 0 && <span className="px-1.5 rounded bg-[#F4F0FF] text-[#7C3AED] font-medium">{gPosts} post</span>}
                    {gComments > 0 && <span className="px-1.5 rounded bg-[#E6F7F5] text-[#0E9F8E] font-medium">{gComments} comment</span>}
                    <span>{getRelativeTime(g.items[0].liked_at)}</span>
                  </span>
                </button>
                {isOpen && (
                  <ul className="divide-y divide-[#F1F2F6] bg-[#FCFCFD] border-t border-[#E5E7ED]">
                    {g.items.map((l) => <LikeItem key={`${l.kind}-${l.id}`} like={l} />)}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
