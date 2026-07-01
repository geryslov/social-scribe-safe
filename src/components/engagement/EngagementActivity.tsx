import { useMemo, useState } from 'react';
import { Publisher } from '@/hooks/usePublishers';
import {
  useAutoLikeHistory, useDiscoveredPosts, usePublisherComments, useEngagementSyncRuns,
  DiscoveredPost,
} from '@/hooks/useEngagementActivity';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from '@/components/ui/collapsible';
import {
  Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription,
} from '@/components/ui/sheet';
import { CommentComposer } from './CommentComposer';
import type { EngagementPost } from '@/hooks/useEngagement';
import { Heart, MessageSquare, TrendingUp, RefreshCw, ChevronRight, ExternalLink, Search, MessageCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface Props { publisher: Publisher }

type Range = 1 | 7 | 30;

export function EngagementActivity({ publisher }: Props) {
  const [range, setRange] = useState<Range>(7);
  const [search, setSearch] = useState('');
  const [composerPost, setComposerPost] = useState<EngagementPost | null>(null);

  const { data: likes = [], isLoading: likesLoading } = useAutoLikeHistory(publisher.id, range);
  const { data: newPosts = [], isLoading: postsLoading } = useDiscoveredPosts(publisher.id, range);
  const { data: comments = [] } = usePublisherComments(publisher.id, range);
  const { data: syncRuns = [] } = useEngagementSyncRuns(50);

  const q = search.trim().toLowerCase();
  const matches = (p: DiscoveredPost) =>
    !q ||
    (p.target_name || '').toLowerCase().includes(q) ||
    (p.content || '').toLowerCase().includes(q);

  const postsFiltered = newPosts.filter(matches);
  const likesFiltered = !q ? likes : likes.filter((l) =>
    (l.target_name || '').toLowerCase().includes(q) ||
    (l.post_excerpt || '').toLowerCase().includes(q));

  // KPIs
  const kpi = useMemo(() => ({
    liked: likes.filter((l) => l.status === 'liked').length,
    discovered: newPosts.length,
    commented: comments.length,
    failed: likes.filter((l) => l.status === 'failed').length,
  }), [likes, newPosts, comments]);

  // Group posts by target
  const byTarget = useMemo(() => {
    const map = new Map<string, {
      id: string; name: string; avatar_url: string | null; linkedin_url: string | null;
      title: string | null; company: string | null; posts: DiscoveredPost[];
    }>();
    for (const p of postsFiltered) {
      const key = p.target_id;
      const existing = map.get(key);
      if (existing) existing.posts.push(p);
      else map.set(key, {
        id: p.target_id,
        name: p.target_name || 'Unknown',
        avatar_url: p.target_avatar_url,
        linkedin_url: p.target_linkedin_url,
        title: p.target_title,
        company: p.target_company,
        posts: [p],
      });
    }
    return [...map.values()].sort((a, b) => b.posts.length - a.posts.length);
  }, [postsFiltered]);

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

  const openComment = (p: DiscoveredPost) => {
    const post: EngagementPost = {
      id: p.id,
      target_id: p.target_id,
      linkedin_post_urn: '',
      linkedin_post_url: p.linkedin_post_url,
      content: p.content,
      published_at: p.published_at,
      likes_count: p.likes_count,
      comments_count: p.comments_count,
      shares_count: p.shares_count ?? 0,
      is_commented: p.is_commented,
      is_liked: p.is_liked,
      liked_at: p.liked_at,
      post_metadata: p.post_metadata || {},
      created_at: p.created_at,
    } as EngagementPost;
    setComposerPost(post);
  };

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

        {/* Newly discovered posts — grouped by profile */}
        <Section title="Posts discovered from tracked profiles" subtitle={`${postsFiltered.length} posts · ${byTarget.length} profiles`}>
          {byTarget.length === 0 ? (
            <EmptyState text={postsLoading ? 'Loading…' : 'No new posts in this range.'} />
          ) : (
            <div className="border rounded-md divide-y bg-background">
              {byTarget.map((t) => (
                <Collapsible key={t.id}>
                  <CollapsibleTrigger className="w-full px-4 py-2.5 flex items-center gap-3 hover:bg-muted/40 text-left group">
                    <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90" />
                    <Avatar url={t.avatar_url} name={t.name} />
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium truncate">{t.name}</div>
                      {(t.title || t.company) && (
                        <div className="text-[11px] text-muted-foreground truncate">
                          {[t.title, t.company].filter(Boolean).join(' · ')}
                        </div>
                      )}
                    </div>
                    <span className="text-xs font-semibold text-emerald-700 tabular-nums">{t.posts.length} new</span>
                  </CollapsibleTrigger>
                  <CollapsibleContent>
                    <div className="bg-muted/20 border-t">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead className="w-36">Discovered</TableHead>
                            <TableHead>Excerpt</TableHead>
                            <TableHead className="w-24 text-right">Reach</TableHead>
                            <TableHead className="w-28">Status</TableHead>
                            <TableHead className="w-28 text-right">Action</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {t.posts.map((p) => (
                            <TableRow key={p.id}>
                              <TableCell className="text-xs font-mono text-muted-foreground tabular-nums">
                                {new Date(p.created_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                              </TableCell>
                              <TableCell className="text-xs text-muted-foreground max-w-md">
                                <span className="line-clamp-2">{(p.content || '—').slice(0, 220)}</span>
                                {p.linkedin_post_url && (
                                  <a href={p.linkedin_post_url} target="_blank" rel="noreferrer" className="ml-1 inline-flex text-primary hover:underline">
                                    <ExternalLink className="h-3 w-3 inline" />
                                  </a>
                                )}
                              </TableCell>
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
                              <TableCell className="text-right">
                                <button
                                  onClick={() => openComment(p)}
                                  className="inline-flex items-center gap-1 h-7 px-2 rounded border text-[11px] font-medium hover:bg-amber-50 hover:border-amber-300 hover:text-amber-700 transition-colors"
                                >
                                  <MessageCircle className="h-3 w-3" /> Comment
                                </button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </CollapsibleContent>
                </Collapsible>
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

        {/* Sync runs — humanized */}
        <Section title="Sync history" subtitle={`${syncRuns.length} recent runs`}>
          {syncRuns.length === 0 ? (
            <EmptyState text="No sync has run yet." />
          ) : (
            <div className="border rounded-md divide-y">
              {syncRuns.slice(0, 15).map((r) => {
                const durMs = r.finished_at ? new Date(r.finished_at).getTime() - new Date(r.started_at).getTime() : 0;
                const duration = durMs > 0 ? `${Math.max(1, Math.round(durMs / 1000))}s` : '—';
                const triggerLabel = r.trigger === 'manual' ? 'Manual' : r.trigger === 'cron' ? 'Scheduled' : r.trigger;
                return (
                  <Collapsible key={r.id}>
                    <CollapsibleTrigger className="w-full px-4 py-3 flex items-center gap-4 hover:bg-muted/40 text-left group">
                      <ChevronRight className="h-3.5 w-3.5 text-muted-foreground transition-transform group-data-[state=open]:rotate-90 flex-shrink-0" />
                      <div className="w-44 flex-shrink-0">
                        <div className="text-xs font-medium">
                          {new Date(r.started_at).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                        </div>
                        <div className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground/60">{triggerLabel} · {duration}</div>
                      </div>
                      <div className="flex-1 flex items-baseline gap-4 text-xs">
                        <span className="tabular-nums">
                          <span className="font-semibold text-emerald-700">{r.new_posts}</span>
                          <span className="text-muted-foreground"> new post{r.new_posts === 1 ? '' : 's'}</span>
                        </span>
                        <span className="tabular-nums text-muted-foreground">
                          <span className="font-semibold text-foreground">{r.synced}</span> of {r.total_targets} profile{r.total_targets === 1 ? '' : 's'} checked
                        </span>
                        {r.failed > 0 && <span className="tabular-nums text-red-600">{r.failed} failed</span>}
                        {r.skipped > 0 && <span className="tabular-nums text-muted-foreground/70">{r.skipped} skipped</span>}
                      </div>
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <div className="px-12 pb-3 pt-1 space-y-1 bg-muted/10">
                        {Array.isArray(r.details) && r.details.length > 0 ? r.details.map((d: any, i: number) => (
                          <div key={i} className="text-xs flex items-baseline gap-3 tabular-nums">
                            <StatusPill status={d.status === 'ok' ? 'liked' : d.status === 'failed' ? 'failed' : 'skipped_already'} />
                            <span className="font-medium truncate max-w-[240px]">{d.name}</span>
                            <span className="text-muted-foreground">{d.posts_found || 0} new</span>
                            {d.detail && <span className="text-muted-foreground/70 truncate">{d.detail}</span>}
                          </div>
                        )) : (
                          <div className="text-xs text-muted-foreground py-1">No per-profile detail recorded.</div>
                        )}
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                );
              })}
            </div>
          )}
        </Section>
      </div>

      {/* Comment composer sheet */}
      <Sheet open={!!composerPost} onOpenChange={(open) => !open && setComposerPost(null)}>
        <SheetContent
          side="bottom"
          className="max-w-[720px] mx-auto rounded-t-2xl border-t-2 border-amber-200/40 p-0 max-h-[80vh] overflow-hidden flex flex-col"
        >
          <SheetHeader className="sr-only">
            <SheetTitle>Comment on post</SheetTitle>
            <SheetDescription>Draft and post a comment.</SheetDescription>
          </SheetHeader>
          {composerPost && (
            <CommentComposer
              post={composerPost}
              publisher={publisher}
              onClose={() => setComposerPost(null)}
            />
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}

function Avatar({ url, name }: { url: string | null; name: string }) {
  const initials = name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <div className="h-8 w-8 rounded-full overflow-hidden bg-muted flex items-center justify-center text-[10px] font-bold text-foreground/60 flex-shrink-0">
      {url ? (
        <img src={url} alt={name} referrerPolicy="no-referrer" className="h-full w-full object-cover" />
      ) : initials}
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
    liked: { label: 'OK', cls: 'bg-emerald-50 text-emerald-700 border-emerald-200' },
    skipped_already: { label: 'Skipped', cls: 'bg-muted text-muted-foreground border-border' },
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
