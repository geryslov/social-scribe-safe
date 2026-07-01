import { useMemo, useState } from 'react';
import { Publisher } from '@/hooks/usePublishers';
import {
  useAutoLikeHistory, useDiscoveredPosts, usePublisherComments, useEngagementSyncRuns,
} from '@/hooks/useEngagementActivity';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import { Heart, MessageSquare, TrendingUp, RefreshCw, ChevronRight, ExternalLink, Search } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { publisher: Publisher }

type Range = 1 | 7 | 30;

export function EngagementActivity({ publisher }: Props) {
  const [range, setRange] = useState<Range>(7);
  const [search, setSearch] = useState('');

  const { data: likes = [], isLoading: likesLoading } = useAutoLikeHistory(publisher.id, range);
  const { data: newPosts = [], isLoading: postsLoading } = useDiscoveredPosts(publisher.id, range);
  const { data: comments = [] } = usePublisherComments(publisher.id, range);
  const { data: syncRuns = [] } = useEngagementSyncRuns(50);

  const q = search.trim().toLowerCase();
  const filterQ = <T extends { target_name?: string | null; content?: string | null; post_excerpt?: string | null }>(rows: T[]) =>
    !q ? rows : rows.filter((r) =>
      (r.target_name || '').toLowerCase().includes(q) ||
      (r.content || '').toLowerCase().includes(q) ||
      (r.post_excerpt || '').toLowerCase().includes(q));

  const likesFiltered = filterQ(likes);
  const postsFiltered = filterQ(newPosts);

  // KPIs
  const kpi = useMemo(() => ({
    liked: likes.filter((l) => l.status === 'liked').length,
    discovered: newPosts.length,
    commented: comments.length,
    failed: likes.filter((l) => l.status === 'failed').length,
  }), [likes, newPosts, comments]);

  // Group auto-likes by day for daily breakdown
  const byDay = useMemo(() => {
    const days = new Map<string, { liked: number; failed: number; cap: number; targets: Set<string> }>();
    for (const l of likes) {
      const day = new Date(l.run_at).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
      const b = days.get(day) || { liked: 0, failed: 0, cap: 0, targets: new Set<string>() };
      if (l.status === 'liked') b.liked++;
      else if (l.status === 'failed') b.failed++;
      else if (l.status === 'skipped_cap') b.cap++;
      if (l.target_name) b.targets.add(l.target_name);
      days.set(day, b);
    }
    return [...days.entries()].map(([day, v]) => ({ day, ...v, targets: [...v.targets] }));
  }, [likes]);

  return (
    <div className="flex-1 overflow-y-auto bg-background">
      <div className="max-w-6xl mx-auto px-6 py-6 space-y-6">
        {/* Controls */}
        <div className="flex flex-wrap items-center gap-3">
          <div className="inline-flex items-center rounded-md border bg-muted/40 p-0.5">
            {([1, 7, 30] as Range[]).map((r) => (
              <button
                key={r}
                onClick={() => setRange(r)}
                className={cn(
                  'px-3 py-1 text-xs font-medium rounded-sm transition-colors',
                  range === r ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {r === 1 ? 'Today' : `${r} days`}
              </button>
            ))}
          </div>
          <div className="relative flex-1 max-w-sm">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground/60" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Filter by profile or content…"
              className="h-8 pl-8 text-xs"
            />
          </div>
        </div>

        {/* KPI row */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Kpi icon={<Heart className="h-4 w-4" />} label="Auto-likes" value={kpi.liked} tone="rose" />
          <Kpi icon={<TrendingUp className="h-4 w-4" />} label="New posts discovered" value={kpi.discovered} tone="emerald" />
          <Kpi icon={<MessageSquare className="h-4 w-4" />} label="Comments posted" value={kpi.commented} tone="amber" />
          <Kpi icon={<RefreshCw className="h-4 w-4" />} label="Like failures" value={kpi.failed} tone={kpi.failed > 0 ? 'red' : 'slate'} />
        </div>

        {/* Per-day breakdown */}
        <Section title="Auto-likes per day" subtitle={`${likes.length} attempts · ${kpi.liked} succeeded`}>
          {byDay.length === 0 ? (
            <EmptyState text={likesLoading ? 'Loading…' : 'No auto-like activity in this range.'} />
          ) : (
            <div className="divide-y">
              {byDay.map((d) => (
                <div key={d.day} className="py-2.5 flex items-baseline gap-4">
                  <span className="w-32 text-xs font-mono text-muted-foreground tabular-nums">{d.day}</span>
                  <span className="text-sm font-semibold text-rose-600 tabular-nums w-16">{d.liked} liked</span>
                  {d.failed > 0 && <span className="text-xs text-red-600">{d.failed} failed</span>}
                  {d.cap > 0 && <span className="text-xs text-amber-600">{d.cap} cap</span>}
                  <span className="flex-1 text-xs text-muted-foreground truncate">
                    {d.targets.slice(0, 5).join(' · ')}{d.targets.length > 5 ? ` +${d.targets.length - 5} more` : ''}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Section>

        {/* Auto-like log */}
        <Section title="Auto-like log" subtitle={`${likesFiltered.length} rows`}>
          {likesFiltered.length === 0 ? (
            <EmptyState text="No matching auto-likes." />
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">When</TableHead>
                    <TableHead className="w-52">Profile</TableHead>
                    <TableHead>Post</TableHead>
                    <TableHead className="w-32">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {likesFiltered.slice(0, 200).map((l) => (
                    <TableRow key={l.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground tabular-nums">
                        {new Date(l.run_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-sm font-medium truncate max-w-[200px]">{l.target_name || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-md">
                        {l.post_excerpt || '—'}
                        {l.post_url && (
                          <a href={l.post_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-primary hover:underline">
                            <ExternalLink className="h-3 w-3 inline" />
                          </a>
                        )}
                      </TableCell>
                      <TableCell><StatusPill status={l.status} error={l.error_message} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        {/* Newly discovered posts */}
        <Section title="Posts discovered from tracked profiles" subtitle={`${postsFiltered.length} rows`}>
          {postsFiltered.length === 0 ? (
            <EmptyState text={postsLoading ? 'Loading…' : 'No new posts in this range.'} />
          ) : (
            <div className="border rounded-md overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-40">Discovered</TableHead>
                    <TableHead className="w-52">Profile</TableHead>
                    <TableHead>Excerpt</TableHead>
                    <TableHead className="w-28 text-right">LinkedIn</TableHead>
                    <TableHead className="w-32">Engaged</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {postsFiltered.slice(0, 200).map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="text-xs font-mono text-muted-foreground tabular-nums">
                        {new Date(p.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell className="text-sm font-medium truncate max-w-[200px]">{p.target_name || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground truncate max-w-md">{(p.content || '').slice(0, 140) || '—'}</TableCell>
                      <TableCell className="text-right text-xs tabular-nums text-muted-foreground">
                        ♥ {p.likes_count} · 💬 {p.comments_count}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {p.is_liked && <Badge variant="outline" className="text-[10px] h-5 border-rose-300 text-rose-600">Liked</Badge>}
                          {p.is_commented && <Badge variant="outline" className="text-[10px] h-5 border-amber-300 text-amber-600">Commented</Badge>}
                          {!p.is_liked && !p.is_commented && <span className="text-[10px] text-muted-foreground">—</span>}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </Section>

        {/* Sync runs */}
        <Section title="Sync history" subtitle={`${syncRuns.length} recent runs`}>
          {syncRuns.length === 0 ? (
            <EmptyState text="No sync has run yet." />
          ) : (
            <div className="border rounded-md divide-y">
              {syncRuns.slice(0, 15).map((r) => (
                <Collapsible key={r.id}>
                  <CollapsibleTrigger className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 text-left">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform data-[state=open]:rotate-90" />
                    <span className="text-xs font-mono text-muted-foreground tabular-nums w-40">
                      {new Date(r.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </span>
                    <span className="text-xs font-semibold text-emerald-700 tabular-nums w-24">+{r.new_posts} new</span>
                    <span className="text-xs text-muted-foreground w-40 tabular-nums">
                      {r.synced}/{r.total_targets} synced · {r.failed} failed
                    </span>
                    <span className="text-[10px] uppercase tracking-wider font-mono text-muted-foreground/60">
                      {r.trigger}
                    </span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="px-10 pb-3 pt-1 space-y-1">
                      {Array.isArray(r.details) && r.details.length > 0 ? r.details.map((d: any, i: number) => (
                        <div key={i} className="text-xs flex items-baseline gap-2 tabular-nums">
                          <span className="w-24 text-muted-foreground">{d.status}</span>
                          <span className="font-medium truncate max-w-[220px]">{d.name}</span>
                          <span className="text-muted-foreground">+{d.posts_found || 0}</span>
                          {d.detail && <span className="text-muted-foreground/70 truncate">{d.detail}</span>}
                        </div>
                      )) : (
                        <div className="text-xs text-muted-foreground">No per-target detail.</div>
                      )}
                    </div>
                  </CollapsibleContent>
                </Collapsible>
              ))}
            </div>
          )}
        </Section>
      </div>
    </div>
  );
}

function Kpi({ icon, label, value, tone }: { icon: React.ReactNode; label: string; value: number; tone: 'rose' | 'emerald' | 'amber' | 'red' | 'slate' }) {
  const toneCls: Record<string, string> = {
    rose: 'text-rose-600 bg-rose-50 border-rose-200/60',
    emerald: 'text-emerald-700 bg-emerald-50 border-emerald-200/60',
    amber: 'text-amber-700 bg-amber-50 border-amber-200/60',
    red: 'text-red-700 bg-red-50 border-red-200/60',
    slate: 'text-slate-600 bg-muted/40 border-border',
  };
  return (
    <div className={cn('rounded-lg border p-3', toneCls[tone])}>
      <div className="flex items-center justify-between">
        <span className="text-[10.5px] font-mono uppercase tracking-wider opacity-70">{label}</span>
        {icon}
      </div>
      <div className="text-2xl font-display font-semibold tabular-nums mt-1">{value}</div>
    </div>
  );
}

function Section({ title, subtitle, children }: { title: string; subtitle?: string; children: React.ReactNode }) {
  return (
    <section>
      <header className="mb-2 flex items-baseline justify-between">
        <h3 className="text-sm font-display font-semibold">{title}</h3>
        {subtitle && <span className="text-[10.5px] font-mono text-muted-foreground/70">{subtitle}</span>}
      </header>
      {children}
    </section>
  );
}

function EmptyState({ text }: { text: string }) {
  return <div className="text-xs text-muted-foreground border rounded-md py-8 text-center bg-muted/20">{text}</div>;
}

function StatusPill({ status, error }: { status: string; error?: string | null }) {
  const map: Record<string, { label: string; cls: string }> = {
    liked: { label: 'Liked', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    skipped_already: { label: 'Already liked', cls: 'bg-muted text-muted-foreground border-border' },
    skipped_cap: { label: 'Cap reached', cls: 'bg-amber-50 text-amber-700 border-amber-200' },
    failed: { label: 'Failed', cls: 'bg-red-50 text-red-700 border-red-200' },
  };
  const m = map[status] || { label: status, cls: 'bg-muted text-muted-foreground border-border' };
  return (
    <span
      title={error || undefined}
      className={cn('inline-flex items-center rounded border px-1.5 py-0.5 text-[10.5px] font-mono uppercase tracking-wider', m.cls)}
    >
      {m.label}
    </span>
  );
}
