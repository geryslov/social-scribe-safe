// =============================================================================
// fetch-target-comments-batch — Batched version of fetch-target-comments
//
// Runs the harvestapi/linkedin-profile-comments actor ONCE for up to BATCH_SIZE
// profile URLs, then distributes the returned comments back to their targets by
// commenter username. Mirrors fetch-target-posts-batch so comment activity is
// fetched on the same daily sync cadence as posts.
//
// Input:  { workspace_id, target_ids: string[], max_items?: number }
// Output: { success, batches, synced, failed, new_comments, details: [...] }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APIFY_ACTOR = 'harvestapi~linkedin-profile-comments';
const APIFY_BASE = 'https://api.apify.com/v2';
const BATCH_SIZE = 40;
const MAX_BATCHES_PER_INVOCATION = 2;
const POLL_MAX_MS = 90_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normaliseProfileUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  url = url.replace(/\/+$/, '').split('?')[0];
  if (!url.endsWith('/')) url += '/';
  return url;
}

function usernameFromUrl(url: string): string | null {
  const m = url.match(/linkedin\.com\/in\/([^/?#]+)/i);
  return m?.[1]?.toLowerCase() || null;
}

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

function parseTimestamp(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'object') {
    const o = v as Record<string, unknown>;
    if (typeof o.date === 'string') {
      const d = new Date(o.date);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
    if (typeof o.timestamp === 'number') {
      const d = new Date(o.timestamp);
      if (!isNaN(d.getTime())) return d.toISOString();
    }
  }
  return null;
}

// Which queried profile (= the commenter, = our target) does this item belong to?
// harvestapi echoes the input at `query.profile` and puts the commenter in `actor`.
function commenterUsername(item: Record<string, unknown>): string | null {
  const query = (item.query || {}) as Record<string, unknown>;
  const actor = (item.actor || {}) as Record<string, unknown>;
  const candidates: (string | null)[] = [
    typeof query.profile === 'string' ? usernameFromUrl(query.profile) : null,
    typeof actor.linkedinUrl === 'string' ? usernameFromUrl(actor.linkedinUrl) : null,
    typeof actor.publicIdentifier === 'string' ? actor.publicIdentifier.toLowerCase() : null,
  ];
  for (const c of candidates) if (c) return c;
  return null;
}

// Extract one stored comment row (comment + the parent post it was left on).
// Field names per harvestapi/linkedin-profile-comments.
function parseCommentItem(item: Record<string, unknown>): Record<string, unknown> | null {
  const commentText = str(item.commentary) || str(item.commentText) || str(item.text) || null;
  const commentUrn = str(item.id) || str(item.commentUrn) || str(item.urn) || null;
  const commentUrl = str(item.linkedinUrl) || str(item.commentUrl) || str(item.url) || null;
  const commentedAt =
    parseTimestamp(item.createdAt) || parseTimestamp(item.createdAtTimestamp) ||
    parseTimestamp(item.commentedAt) || null;
  const engagement = (item.engagement || {}) as Record<string, unknown>;
  const reactions = typeof engagement.likes === 'number' ? engagement.likes : 0;

  const post = (item.post || {}) as Record<string, unknown>;
  const postAuthor = (post.author || {}) as Record<string, unknown>;

  const parentPostUrl = str(post.linkedinUrl) || str(post.shareLinkedinUrl) || null;
  const parentPostContent = str(post.content) || null;
  const parentAuthorName = str(postAuthor.name) || null;

  const dedupKey =
    commentUrn || commentUrl ||
    (commentText ? `${commentText.slice(0, 80)}#${commentedAt ?? ''}` : null);
  if (!dedupKey) return null;

  return {
    dedup_key: dedupKey,
    comment_urn: commentUrn,
    comment_url: commentUrl,
    comment_text: commentText,
    commented_at: commentedAt,
    reactions_count: reactions,
    parent_post_url: parentPostUrl,
    parent_post_urn: str(post.shareUrn) || str(post.entityId) || str(post.id) || null,
    parent_post_author_name: parentAuthorName,
    parent_post_author_headline: str(postAuthor.info) || null,
    parent_post_author_url: str(postAuthor.linkedinUrl) || null,
    parent_post_content: parentPostContent,
    parent_post_published_at: parseTimestamp(post.postedAt) || null,
    comment_metadata: { raw: item },
  };
}

async function startApifyRun(profileUrls: string[], apifyToken: string, maxItems: number, postedLimit: string): Promise<string | null> {
  const url = `${APIFY_BASE}/acts/${APIFY_ACTOR}/runs?token=${apifyToken}`;
  console.log(`Starting Apify comments batch: ${profileUrls.length} URLs, window ${postedLimit}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ profiles: profileUrls, maxItems, postedLimit }),
  });
  if (!res.ok) {
    console.error(`Apify start failed (${res.status}):`, await res.text());
    return null;
  }
  const data = await res.json();
  return data?.data?.id || null;
}

async function pollApifyRun(runId: string, apifyToken: string, maxWaitMs: number) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apifyToken}`);
    if (!res.ok) return { status: 'FAILED', datasetId: null as string | null };
    const data = await res.json();
    const status = data?.data?.status;
    const datasetId = data?.data?.defaultDatasetId;
    if (status === 'SUCCEEDED') return { status, datasetId };
    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') return { status, datasetId: null };
    await sleep(4000);
  }
  return { status: 'POLL_TIMEOUT', datasetId: null };
}

async function fetchApifyDataset(datasetId: string, apifyToken: string) {
  const res = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&format=json`);
  if (!res.ok) return [];
  const items = await res.json();
  return Array.isArray(items) ? items : [];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json();
    const workspace_id: string = body.workspace_id;
    const target_ids: string[] = body.target_ids || [];
    const maxItems: number = body.max_items ?? 15;

    if (!workspace_id || !Array.isArray(target_ids) || target_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id and target_ids[] are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

    const { data: keyRow } = await supabase
      .from('workspace_api_keys')
      .select('api_key_encrypted')
      .eq('workspace_id', workspace_id)
      .eq('service_name', 'apify')
      .eq('is_valid', true)
      .maybeSingle();
    if (!keyRow?.api_key_encrypted) {
      return new Response(
        JSON.stringify({ success: false, error: 'No Apify API token configured.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }
    const apifyToken = keyRow.api_key_encrypted;

    const { data: targets, error: targetsErr } = await supabase
      .from('engagement_targets')
      .select('id, linkedin_url, linkedin_username, last_comments_fetched_at, name')
      .eq('workspace_id', workspace_id)
      .in('id', target_ids);
    if (targetsErr || !targets) {
      return new Response(
        JSON.stringify({ success: false, error: targetsErr?.message || 'Failed to load targets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const validTargets = targets.filter((t: any) => t.linkedin_url);
    const chunks: typeof validTargets[] = [];
    for (let i = 0; i < validTargets.length; i += BATCH_SIZE) chunks.push(validTargets.slice(i, i + BATCH_SIZE));

    const details: any[] = [];
    let totalSynced = 0;
    let totalFailed = 0;
    let totalNewComments = 0;
    let batchesRun = 0;
    const processedIds = new Set<string>();

    for (const chunk of chunks) {
      if (batchesRun >= MAX_BATCHES_PER_INVOCATION) break;
      batchesRun++;

      const byUsername = new Map<string, any>();
      const urls: string[] = [];
      for (const t of chunk) {
        const url = normaliseProfileUrl(t.linkedin_url);
        urls.push(url);
        const uname = t.linkedin_username?.toLowerCase() || usernameFromUrl(url);
        if (uname) byUsername.set(uname, t);
      }

      // Daily cadence: a week window comfortably covers a day's gap. The
      // (target_id, dedup_key) unique constraint absorbs overlap, and harvestapi
      // bills per comment returned, so a tighter window keeps cost down.
      const postedLimit = 'week';

      const runId = await startApifyRun(urls, apifyToken, maxItems, postedLimit);
      if (!runId) {
        for (const t of chunk) {
          details.push({ target_id: t.id, name: t.name, status: 'failed', comments_found: 0, detail: 'Apify start failed' });
          processedIds.add(t.id);
          totalFailed++;
        }
        continue;
      }

      const { status, datasetId } = await pollApifyRun(runId, apifyToken, POLL_MAX_MS);
      if (status !== 'SUCCEEDED' || !datasetId) {
        for (const t of chunk) {
          details.push({ target_id: t.id, name: t.name, status: 'failed', comments_found: 0, detail: `Apify ${status}` });
          processedIds.add(t.id);
          totalFailed++;
        }
        continue;
      }

      const rawItems = await fetchApifyDataset(datasetId, apifyToken);

      // Group items by commenter username (the commenter is our target)
      const itemsByUsername = new Map<string, any[]>();
      for (const item of rawItems as any[]) {
        const uname = commenterUsername(item);
        if (!uname) continue;
        const arr = itemsByUsername.get(uname) || [];
        arr.push(item);
        itemsByUsername.set(uname, arr);
      }

      for (const [uname, target] of byUsername.entries()) {
        const items = itemsByUsername.get(uname) || [];
        let inserted = 0;

        if (items.length > 0) {
          const rows = items
            .map((item: any) => parseCommentItem(item))
            .filter(Boolean)
            .map((c: any) => ({ workspace_id, target_id: target.id, ...c }));

          if (rows.length > 0) {
            const { data: result, error: insertErr } = await supabase
              .from('engagement_target_comments')
              .upsert(rows, { onConflict: 'target_id,dedup_key', ignoreDuplicates: false })
              .select('id');
            if (insertErr) console.error('Upsert error for target', target.id, insertErr);
            else inserted = result?.length ?? 0;
          }
        }

        await supabase
          .from('engagement_targets')
          .update({ last_comments_fetched_at: new Date().toISOString() })
          .eq('id', target.id);

        details.push({ target_id: target.id, name: target.name, status: 'synced', comments_found: inserted });
        processedIds.add(target.id);
        totalSynced++;
        totalNewComments += inserted;
      }

      // Targets in the chunk with no returned comments still count as synced.
      for (const t of chunk) {
        if (!processedIds.has(t.id)) {
          await supabase
            .from('engagement_targets')
            .update({ last_comments_fetched_at: new Date().toISOString() })
            .eq('id', t.id);
          details.push({ target_id: t.id, name: t.name, status: 'synced', comments_found: 0 });
          processedIds.add(t.id);
          totalSynced++;
        }
      }
    }

    const deferred = validTargets.filter((t: any) => !processedIds.has(t.id));
    for (const t of deferred) details.push({ target_id: t.id, name: t.name, status: 'deferred', comments_found: 0 });

    return new Response(
      JSON.stringify({
        success: true,
        batches: batchesRun,
        synced: totalSynced,
        failed: totalFailed,
        deferred: deferred.length,
        new_comments: totalNewComments,
        details,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    console.error('fetch-target-comments-batch error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
