import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

interface ExportOptions {
  includeCommenters?: boolean;
}

interface AggRow {
  actor_name: string;
  actor_headline: string;
  actor_profile_url: string;
  total_reactions: number;
  posts_engaged: Set<string>;
  reactions_by_type: Record<string, number>;
  total_comments: number;
  comments_posts: Set<string>;
  first_at: string | null;
  last_at: string | null;
}

const REACTION_LABELS: Record<string, string> = {
  LIKE: 'likes',
  PRAISE: 'celebrate',
  EMPATHY: 'love',
  INTEREST: 'insightful',
  APPRECIATION: 'support',
  ENTERTAINMENT: 'funny',
  MAYBE: 'curious',
};

const REACTION_COLS = ['likes', 'celebrate', 'love', 'insightful', 'support', 'funny', 'curious'];

function csvEscape(v: unknown): string {
  if (v === null || v === undefined) return '';
  const s = String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function updateTimestamps(row: AggRow, ts: string | null) {
  if (!ts) return;
  if (!row.first_at || ts < row.first_at) row.first_at = ts;
  if (!row.last_at || ts > row.last_at) row.last_at = ts;
}

async function fetchAllPaged<T>(
  build: (from: number, to: number) => Promise<{ data: T[] | null; error: any }>
): Promise<T[]> {
  const all: T[] = [];
  const pageSize = 1000;
  let from = 0;
  while (true) {
    const { data, error } = await build(from, from + pageSize - 1);
    if (error) throw error;
    if (!data || data.length === 0) break;
    all.push(...data);
    if (data.length < pageSize) break;
    from += pageSize;
  }
  return all;
}

export async function exportWorkspaceReactors(
  workspaceId: string,
  workspaceSlug: string,
  opts: ExportOptions = {}
): Promise<{ rows: number }> {
  // 1. Get workspace post IDs
  const { data: posts, error: postsErr } = await supabase
    .from('posts')
    .select('id')
    .eq('workspace_id', workspaceId);
  if (postsErr) throw postsErr;
  const postIds = (posts || []).map(p => p.id);
  if (postIds.length === 0) {
    throw new Error('No posts found in this workspace');
  }

  // 2. Fetch reactors in chunks (post_id IN limited)
  const chunkSize = 200;
  const reactors: any[] = [];
  for (let i = 0; i < postIds.length; i += chunkSize) {
    const slice = postIds.slice(i, i + chunkSize);
    const rows = await fetchAllPaged<any>((from, to) =>
      supabase
        .from('post_reactors')
        .select('post_id, actor_urn, actor_name, actor_headline, actor_profile_url, reaction_type, reacted_at')
        .in('post_id', slice)
        .range(from, to)
    );
    reactors.push(...rows);
  }

  // 3. Optional commenters
  const commenters: any[] = [];
  if (opts.includeCommenters) {
    for (let i = 0; i < postIds.length; i += chunkSize) {
      const slice = postIds.slice(i, i + chunkSize);
      const rows = await fetchAllPaged<any>((from, to) =>
        supabase
          .from('post_comments')
          .select('post_id, author_urn, author_name, author_headline, author_profile_url, commented_at')
          .in('post_id', slice)
          .range(from, to)
      );
      commenters.push(...rows);
    }
  }

  // 4. Aggregate by actor key (URN preferred, profile_url fallback)
  const map = new Map<string, AggRow>();
  const keyOf = (urn: string | null, url: string | null, name: string | null) =>
    urn || url || name || 'unknown';

  for (const r of reactors) {
    const key = keyOf(r.actor_urn, r.actor_profile_url, r.actor_name);
    let row = map.get(key);
    if (!row) {
      row = {
        actor_name: r.actor_name || '',
        actor_headline: r.actor_headline || '',
        actor_profile_url: r.actor_profile_url || '',
        total_reactions: 0,
        posts_engaged: new Set(),
        reactions_by_type: {},
        total_comments: 0,
        comments_posts: new Set(),
        first_at: null,
        last_at: null,
      };
      map.set(key, row);
    }
    row.total_reactions += 1;
    row.posts_engaged.add(r.post_id);
    const label = REACTION_LABELS[r.reaction_type] || r.reaction_type?.toLowerCase() || 'other';
    row.reactions_by_type[label] = (row.reactions_by_type[label] || 0) + 1;
    updateTimestamps(row, r.reacted_at);
    // backfill profile fields if missing
    if (!row.actor_headline && r.actor_headline) row.actor_headline = r.actor_headline;
    if (!row.actor_profile_url && r.actor_profile_url) row.actor_profile_url = r.actor_profile_url;
  }

  for (const c of commenters) {
    const key = keyOf(c.author_urn, c.author_profile_url, c.author_name);
    let row = map.get(key);
    if (!row) {
      row = {
        actor_name: c.author_name || '',
        actor_headline: c.author_headline || '',
        actor_profile_url: c.author_profile_url || '',
        total_reactions: 0,
        posts_engaged: new Set(),
        reactions_by_type: {},
        total_comments: 0,
        comments_posts: new Set(),
        first_at: null,
        last_at: null,
      };
      map.set(key, row);
    }
    row.total_comments += 1;
    row.comments_posts.add(c.post_id);
    updateTimestamps(row, c.commented_at);
    if (!row.actor_headline && c.author_headline) row.actor_headline = c.author_headline;
    if (!row.actor_profile_url && c.author_profile_url) row.actor_profile_url = c.author_profile_url;
  }

  // 5. Build CSV
  const headers = [
    'actor_name', 'actor_headline', 'actor_profile_url',
    'total_reactions', 'posts_engaged',
    ...REACTION_COLS,
  ];
  if (opts.includeCommenters) headers.push('total_comments', 'total_engagements');
  headers.push('first_engagement', 'last_engagement');

  const rows = Array.from(map.values()).sort((a, b) => {
    const ae = a.total_reactions + a.total_comments;
    const be = b.total_reactions + b.total_comments;
    return be - ae;
  });

  const lines = [headers.join(',')];
  for (const r of rows) {
    const cells: (string | number)[] = [
      r.actor_name,
      r.actor_headline,
      r.actor_profile_url,
      r.total_reactions,
      r.posts_engaged.size,
      ...REACTION_COLS.map(c => r.reactions_by_type[c] || 0),
    ];
    if (opts.includeCommenters) {
      cells.push(r.total_comments, r.total_reactions + r.total_comments);
    }
    cells.push(r.first_at || '', r.last_at || '');
    lines.push(cells.map(csvEscape).join(','));
  }

  // 6. Trigger download
  const csv = '\uFEFF' + lines.join('\n'); // BOM for Excel
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${workspaceSlug}-engagers-${format(new Date(), 'yyyy-MM-dd')}.csv`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  return { rows: rows.length };
}
