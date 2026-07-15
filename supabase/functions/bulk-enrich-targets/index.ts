// =============================================================================
// bulk-enrich-targets — Batched server-side enrichment + post fetch
//
// Instead of calling fetch-target-posts once per target (each of which starts
// its own Apify run and polls for ~30s), this batches many LinkedIn profile
// URLs into a single Apify run. One poll handles ~20 profiles at once, then
// results are split back per target. Massive speedup for bulk imports.
//
// Input:  { workspace_id, target_ids?, publisher_id?, batch_size? }
// Output: { success, queued }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const APIFY_BASE = 'https://api.apify.com/v2';
const APIFY_POSTS_ACTOR = 'harvestapi~linkedin-profile-posts';

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function normaliseProfileUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  url = url.replace(/\/+$/, '').split('?')[0];
  if (!url.endsWith('/')) url += '/';
  return url;
}

function parseTimestamp(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string' || typeof v === 'number') {
    const d = new Date(v as string | number);
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

function pickAvatar(a: Record<string, unknown>): string | null {
  const c: unknown[] = [
    a.avatar, a.profilePicture, a.profilePictureUrl, a.pictureUrl, a.picture,
    a.image, a.imageUrl, a.photo, a.photoUrl, a.profileImage, a.profileImageUrl,
    (a.avatar as Record<string, unknown> | undefined)?.url,
    (a.profilePicture as Record<string, unknown> | undefined)?.url,
  ];
  for (const x of c) if (typeof x === 'string' && x.startsWith('http')) return x;
  return null;
}

function extractUsername(url: string): string | null {
  return url.match(/linkedin\.com\/in\/([^/?#]+)/)?.[1] ?? null;
}

async function startBatchRun(urls: string[], token: string): Promise<string | null> {
  const res = await fetch(`${APIFY_BASE}/acts/${APIFY_POSTS_ACTOR}/runs?token=${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrls: urls,
      maxPosts: 2,
      scrapeReactions: false,
      scrapeComments: false,
      includeReposts: true,
      includeQuotePosts: true,
    }),
  });
  if (!res.ok) {
    console.error('Apify start failed:', res.status, await res.text());
    return null;
  }
  const j = await res.json();
  return j?.data?.id ?? null;
}

async function pollRun(runId: string, token: string, maxWaitMs = 240_000): Promise<string | null> {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const res = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${token}`);
    if (!res.ok) { await res.text().catch(() => ''); return null; }
    const j = await res.json();
    const status = j?.data?.status;
    if (status === 'SUCCEEDED') return j?.data?.defaultDatasetId ?? null;
    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') return null;
    await sleep(4000);
  }
  return null;
}

async function fetchDataset(datasetId: string, token: string): Promise<Record<string, unknown>[]> {
  const res = await fetch(`${APIFY_BASE}/datasets/${datasetId}/items?token=${token}&format=json`);
  if (!res.ok) return [];
  const j = await res.json();
  return Array.isArray(j) ? j : [];
}

async function processBatch(
  supabase: ReturnType<typeof createClient>,
  workspace_id: string,
  targets: Array<{ id: string; linkedin_url: string }>,
  apifyToken: string,
) {
  const markBatchFailed = async (reason: string) => {
    console.error('[bulk-enrich]', reason);
    const { error } = await supabase
      .from('engagement_targets')
      .update({ enrichment_status: 'failed', enriched_at: new Date().toISOString() })
      .eq('workspace_id', workspace_id)
      .in('id', targets.map((t) => t.id));
    if (error) console.error('[bulk-enrich] failed to mark batch failed:', error.message);
  };

  const urls = targets.map((t) => normaliseProfileUrl(t.linkedin_url));
  const runId = await startBatchRun(urls, apifyToken);
  if (!runId) {
    await markBatchFailed(`batch start failed for ${targets.length} targets`);
    return;
  }
  console.log(`[bulk-enrich] batch run ${runId} started for ${targets.length} targets`);
  const datasetId = await pollRun(runId, apifyToken);
  if (!datasetId) {
    await markBatchFailed(`batch run ${runId} failed`);
    return;
  }
  const items = await fetchDataset(datasetId, apifyToken);
  console.log(`[bulk-enrich] batch ${runId} returned ${items.length} items`);

  // Group items by author public identifier / profile URL.
  const byUsername = new Map<string, Record<string, unknown>[]>();
  for (const item of items) {
    const author = (item.author || {}) as Record<string, unknown>;
    const uname =
      (author.publicIdentifier as string) ||
      extractUsername((item.linkedinUrl as string) || (item.postUrl as string) || (item.url as string) || '') ||
      '';
    if (!uname) continue;
    const key = uname.toLowerCase();
    if (!byUsername.has(key)) byUsername.set(key, []);
    byUsername.get(key)!.push(item);
  }

  for (const target of targets) {
    const uname = extractUsername(target.linkedin_url)?.toLowerCase();
    const tItems = uname ? (byUsername.get(uname) ?? []) : [];

    // Insert posts
    if (tItems.length > 0) {
      const rows = tItems.map((it) => {
        const eng = (it.engagement || {}) as Record<string, unknown>;
        const author = (it.author || {}) as Record<string, unknown>;
        return {
          workspace_id,
          target_id: target.id,
          linkedin_post_urn: (it.id as string) || (it.postId as string) || (it.urn as string) || null,
          linkedin_post_url: (it.linkedinUrl as string) || (it.postUrl as string) || (it.url as string) || '',
          content: (it.content as string) || (it.text as string) || null,
          published_at: parseTimestamp(it.postedAt) || parseTimestamp(it.publishedAt) || parseTimestamp(it.postedDate),
          likes_count: (eng.likes as number) ?? (it.likes as number) ?? 0,
          comments_count: (eng.comments as number) ?? (it.comments as number) ?? 0,
          shares_count: (eng.shares as number) ?? (it.shares as number) ?? 0,
          post_metadata: {
            author_name: author.name ?? null,
            author_username: author.publicIdentifier ?? null,
            author_avatar: pickAvatar(author),
            type: (it.type as string) ?? null,
          },
        };
      }).filter((r) => r.linkedin_post_url);

      if (rows.length > 0) {
        const { error } = await supabase
          .from('engagement_posts')
          .upsert(rows, { onConflict: 'target_id,linkedin_post_urn', ignoreDuplicates: false });
        if (error) console.error('[bulk-enrich] post upsert failed for target', target.id, error.message);
      }
    }

    // Update target profile. A target the actor returned nothing for (deleted or
    // private profile) fails on its own — it no longer drags its 19 batch-mates
    // down with it.
    const update: Record<string, unknown> = {
      last_fetched_at: new Date().toISOString(),
      linkedin_username: uname,
      enrichment_status: tItems.length > 0 ? 'succeeded' : 'failed',
      enriched_at: new Date().toISOString(),
    };
    if (tItems.length > 0) {
      const author = (tItems[0].author || {}) as Record<string, unknown>;
      const avatar = pickAvatar(author);
      if (avatar) update.avatar_url = avatar;
      const info = (author.info as string) || '';
      if (info) {
        update.headline = info;
        const atMatch = info.match(/^(.+?)\s+at\s+(.+)$/i);
        const pipeMatch = info.match(/^(.+?)\s*[|·]\s*(.+)$/);
        if (atMatch) { update.title = atMatch[1].trim(); update.company_name = atMatch[2].trim(); }
        else if (pipeMatch) { update.title = pipeMatch[1].trim(); update.company_name = pipeMatch[2].trim(); }
        else update.title = info;
      }
      if (typeof author.name === 'string' && author.name.length > 2) update.name = author.name;
    }
    const { error } = await supabase
      .from('engagement_targets')
      .update(update)
      .eq('workspace_id', workspace_id)
      .eq('id', target.id);
    if (error) console.error('[bulk-enrich] target update failed for', target.id, error.message);
  }
}

// Process exactly one wave (parallelBatches batches, running concurrently), then
// hand the remainder to a fresh invocation. A wave is bounded by pollRun's 240s
// ceiling, which keeps every invocation clear of the edge runtime's wall-clock
// limit. Trying to drain the whole list in one invocation meant a large import
// got killed mid-flight, stranding its targets in `processing` forever.
async function processWave(
  workspace_id: string,
  targets: Array<{ id: string; linkedin_url: string }>,
  batchSize: number,
  parallelBatches: number,
  apifyToken: string,
) {
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const wave: Array<typeof targets> = [];
  for (let i = 0; i < targets.length && wave.length < parallelBatches; i += batchSize) {
    wave.push(targets.slice(i, i + batchSize));
  }
  const consumed = wave.reduce((n, b) => n + b.length, 0);
  const remaining = targets.slice(consumed);

  console.log(`[bulk-enrich] wave: ${consumed} targets in ${wave.length} batches, ${remaining.length} deferred`);

  await Promise.all(
    wave.map(async (batch, idx) => {
      try {
        await processBatch(supabase, workspace_id, batch, apifyToken);
      } catch (e) {
        console.error(`[bulk-enrich] batch ${idx} error:`, e);
      }
    }),
  );

  if (remaining.length === 0) {
    console.log('[bulk-enrich] all targets done');
    return;
  }

  const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-enrich-targets`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    },
    body: JSON.stringify({
      workspace_id,
      target_ids: remaining.map((t) => t.id),
      batch_size: batchSize,
      parallel_batches: parallelBatches,
    }),
  });
  if (!res.ok) {
    console.error('[bulk-enrich] chain invoke failed:', res.status, await res.text().catch(() => ''));
    await supabase
      .from('engagement_targets')
      .update({ enrichment_status: 'pending' })
      .eq('workspace_id', workspace_id)
      .in('id', remaining.map((t) => t.id));
  }
}

// Targets left `processing` by an invocation that died (deploy, timeout, crash)
// are otherwise never retried, and the client polls them every 4s forever.
async function resetStaleProcessing(
  supabase: ReturnType<typeof createClient>,
  workspace_id: string,
) {
  const cutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
  const { data, error } = await supabase
    .from('engagement_targets')
    .update({ enrichment_status: 'failed', enriched_at: new Date().toISOString() })
    .eq('workspace_id', workspace_id)
    .eq('enrichment_status', 'processing')
    .lt('updated_at', cutoff)
    .select('id');
  if (error) console.error('[bulk-enrich] stale sweep failed:', error.message);
  else if (data?.length) console.log(`[bulk-enrich] swept ${data.length} stale processing targets`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id: string | undefined = body.workspace_id;
    const target_ids: string[] | undefined = body.target_ids;
    const publisher_id: string | undefined = body.publisher_id;
    const batchSize: number = Math.min(Math.max(Number(body.batch_size) || 20, 5), 50);
    const parallelBatches: number = Math.min(Math.max(Number(body.parallel_batches) || 3, 1), 5);

    if (!workspace_id) {
      return new Response(JSON.stringify({ error: 'workspace_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    await resetStaleProcessing(supabase, workspace_id);

    let query = supabase
      .from('engagement_targets')
      .select('id, linkedin_url')
      .eq('workspace_id', workspace_id);

    if (target_ids?.length) {
      query = query.in('id', target_ids);
    } else if (publisher_id) {
      query = query.eq('publisher_id', publisher_id).neq('enrichment_status', 'succeeded').limit(1000);
    } else {
      return new Response(JSON.stringify({ error: 'target_ids or publisher_id required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: targets, error } = await query;
    if (error) throw error;
    const list = (targets ?? []).filter((t: { linkedin_url: string }) => !!t.linkedin_url) as Array<{ id: string; linkedin_url: string }>;

    if (list.length === 0) {
      return new Response(JSON.stringify({ success: true, queued: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch Apify token once
    const { data: keyRow } = await supabase
      .from('workspace_api_keys')
      .select('api_key_encrypted')
      .eq('workspace_id', workspace_id)
      .eq('service_name', 'apify')
      .eq('is_valid', true)
      .maybeSingle();

    if (!keyRow?.api_key_encrypted) {
      return new Response(JSON.stringify({ error: 'No Apify API token configured' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Mark as processing
    const { error: processingError } = await supabase
      .from('engagement_targets')
      .update({ enrichment_status: 'processing' })
      .eq('workspace_id', workspace_id)
      .in('id', list.map((t) => t.id));
    if (processingError) throw processingError;

    // @ts-ignore EdgeRuntime is available in Supabase Edge runtime
    EdgeRuntime.waitUntil(processWave(workspace_id, list, batchSize, parallelBatches, keyRow.api_key_encrypted as string));

    return new Response(JSON.stringify({ success: true, queued: list.length, batches: Math.ceil(list.length / batchSize) }), {
      status: 202, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[bulk-enrich-targets] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
