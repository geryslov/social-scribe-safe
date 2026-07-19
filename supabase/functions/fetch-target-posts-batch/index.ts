// =============================================================================
// fetch-target-posts-batch — Batched version of fetch-target-posts
//
// Runs the harvestapi/linkedin-profile-posts actor ONCE for up to BATCH_SIZE
// profile URLs, then distributes the returned posts back to their targets.
//
// A single Apify run of 40 URLs takes ~60-90s total instead of 40 × ~12s
// sequential runs. Callers (sync-all-engagement-targets) should invoke this
// repeatedly with different target batches until they're all done.
//
// Input:  { workspace_id, target_ids: string[], max_posts?: number }
// Output: { success, batches, synced, failed, new_posts, details: [...] }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APIFY_ACTOR = 'harvestapi~linkedin-profile-posts';
const APIFY_BASE = 'https://api.apify.com/v2';
const BATCH_SIZE = 40;
const MAX_BATCHES_PER_INVOCATION = 2; // ~2min work per hop
const POLL_MAX_MS = 90_000;
const THIRTY_DAYS_MS = 30 * 24 * 60 * 60 * 1000;

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

function pickAvatar(a: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    a.avatar, a.profilePicture, a.profilePictureUrl, a.pictureUrl, a.picture,
    a.image, a.imageUrl, a.photo, a.photoUrl, a.profileImage, a.profileImageUrl,
    (a.avatar as Record<string, unknown> | undefined)?.url,
    (a.profilePicture as Record<string, unknown> | undefined)?.url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

async function startApifyRun(
  profileUrls: string[],
  apifyToken: string,
  maxPosts: number,
  postedLimitDate: string,
): Promise<string | null> {
  const url = `${APIFY_BASE}/acts/${APIFY_ACTOR}/runs?token=${apifyToken}`;
  console.log(`Starting Apify batch run: ${profileUrls.length} URLs, since ${postedLimitDate}`);
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrls: profileUrls,
      maxPosts,
      postedLimitDate,
      scrapeReactions: false,
      scrapeComments: false,
      includeReposts: true,
      includeQuotePosts: true,
    }),
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
    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
      return { status, datasetId: null };
    }
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
    const maxPosts: number = body.max_posts ?? 5;

    if (!workspace_id || !Array.isArray(target_ids) || target_ids.length === 0) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id and target_ids[] are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load Apify token
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

    // Load targets
    const { data: targets, error: targetsErr } = await supabase
      .from('engagement_targets')
      .select('id, linkedin_url, linkedin_username, last_fetched_at, name')
      .eq('workspace_id', workspace_id)
      .in('id', target_ids);
    if (targetsErr || !targets) {
      return new Response(
        JSON.stringify({ success: false, error: targetsErr?.message || 'Failed to load targets' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const validTargets = targets.filter((t: any) => t.linkedin_url);

    // Chunk into batches
    const chunks: typeof validTargets[] = [];
    for (let i = 0; i < validTargets.length; i += BATCH_SIZE) {
      chunks.push(validTargets.slice(i, i + BATCH_SIZE));
    }

    const details: any[] = [];
    let totalSynced = 0;
    let totalFailed = 0;
    let totalNewPosts = 0;
    let batchesRun = 0;
    const processedIds = new Set<string>();

    for (const chunk of chunks) {
      if (batchesRun >= MAX_BATCHES_PER_INVOCATION) break;
      batchesRun++;

      // Normalize URLs + build url→target lookup by username
      const byUsername = new Map<string, any>();
      const urls: string[] = [];
      for (const t of chunk) {
        const url = normaliseProfileUrl(t.linkedin_url);
        urls.push(url);
        const uname = t.linkedin_username?.toLowerCase() || usernameFromUrl(url);
        if (uname) byUsername.set(uname, t);
      }

      // Oldest last_fetched_at (or 30d back) as batch cutoff
      let oldest = Date.now() - THIRTY_DAYS_MS;
      for (const t of chunk) {
        if (t.last_fetched_at) {
          const ts = new Date(t.last_fetched_at).getTime();
          if (ts < oldest) oldest = ts;
        } else {
          oldest = Math.min(oldest, Date.now() - THIRTY_DAYS_MS);
        }
      }
      const postedLimitDate = new Date(oldest).toISOString();

      const runId = await startApifyRun(urls, apifyToken, maxPosts, postedLimitDate);
      if (!runId) {
        for (const t of chunk) {
          details.push({ target_id: t.id, name: t.name, status: 'failed', posts_found: 0, detail: 'Apify start failed' });
          processedIds.add(t.id);
          totalFailed++;
        }
        continue;
      }

      const { status, datasetId } = await pollApifyRun(runId, apifyToken, POLL_MAX_MS);
      if (status !== 'SUCCEEDED' || !datasetId) {
        for (const t of chunk) {
          details.push({ target_id: t.id, name: t.name, status: 'failed', posts_found: 0, detail: `Apify ${status}` });
          processedIds.add(t.id);
          totalFailed++;
        }
        continue;
      }

      const rawItems = await fetchApifyDataset(datasetId, apifyToken);

      // Group items by author username
      const itemsByUsername = new Map<string, any[]>();
      for (const item of rawItems as any[]) {
        const author = (item.author || {}) as Record<string, unknown>;
        let uname =
          (typeof author.publicIdentifier === 'string' && author.publicIdentifier.toLowerCase()) ||
          (typeof author.linkedinUrl === 'string' && usernameFromUrl(author.linkedinUrl as string)) ||
          (typeof item.query === 'string' && usernameFromUrl(item.query as string)) ||
          null;
        if (!uname) continue;
        const arr = itemsByUsername.get(uname) || [];
        arr.push(item);
        itemsByUsername.set(uname, arr);
      }

      // For each target in the chunk, upsert its posts and update metadata
      for (const [uname, target] of byUsername.entries()) {
        const items = itemsByUsername.get(uname) || [];
        let inserted = 0;

        if (items.length > 0) {
          const rows = items.map((item: any) => {
            const postUrl =
              item.linkedinUrl || item.postUrl || item.url || item.link || '';
            const engagement = (item.engagement || {}) as Record<string, unknown>;
            const author = (item.author || {}) as Record<string, unknown>;
            return {
              workspace_id,
              target_id: target.id,
              linkedin_post_urn: item.id || item.postId || item.urn || null,
              linkedin_post_url: postUrl,
              content: item.content || item.text || item.commentary || null,
              published_at:
                parseTimestamp(item.postedAt) ||
                parseTimestamp(item.publishedAt) ||
                parseTimestamp(item.postedDate) ||
                null,
              likes_count: (engagement.likes as number) ?? (item.likes as number) ?? 0,
              comments_count: (engagement.comments as number) ?? (item.comments as number) ?? 0,
              shares_count: (engagement.shares as number) ?? (item.shares as number) ?? 0,
              post_metadata: {
                author_name: author.name || null,
                author_username: author.publicIdentifier || null,
                author_avatar: author.avatar || null,
                images: item.postImages || item.images || [],
                document: item.document || null,
                reactions: engagement.reactions || null,
                type: item.type || null,
              },
            };
          }).filter((r) => r.linkedin_post_url);

          if (rows.length > 0) {
            const { data: result, error: insertErr } = await supabase
              .from('engagement_posts')
              .upsert(rows, { onConflict: 'target_id,linkedin_post_urn', ignoreDuplicates: false })
              .select('id');
            if (insertErr) console.error('Upsert error for target', target.id, insertErr);
            else inserted = result?.length ?? 0;
          }
        }

        // Update target metadata (use first item)
        const targetUpdate: Record<string, unknown> = {
          last_fetched_at: new Date().toISOString(),
          linkedin_username: uname,
        };
        if (items.length > 0) {
          const first = items[0];
          const author = (first.author || {}) as Record<string, unknown>;
          const avatar = pickAvatar(author) || pickAvatar(first);
          if (avatar) targetUpdate.avatar_url = avatar;
          const info = (author.info as string) || '';
          if (info) {
            targetUpdate.headline = info;
            const atMatch = info.match(/^(.+?)\s+at\s+(.+)$/i);
            const pipeMatch = info.match(/^(.+?)\s*[|·]\s*(.+)$/);
            if (atMatch) {
              targetUpdate.title = atMatch[1].trim();
              targetUpdate.company_name = atMatch[2].trim();
            } else if (pipeMatch) {
              targetUpdate.title = pipeMatch[1].trim();
              targetUpdate.company_name = pipeMatch[2].trim();
            } else {
              targetUpdate.title = info;
            }
          }
          if (typeof author.title === 'string') targetUpdate.title = author.title;
          if (typeof author.company === 'string') targetUpdate.company_name = author.company;
          if (typeof author.companyName === 'string') targetUpdate.company_name = author.companyName;
          if (typeof author.name === 'string' && (author.name as string).length > 2) {
            targetUpdate.name = author.name;
          }
        }
        await supabase.from('engagement_targets').update(targetUpdate).eq('id', target.id);

        details.push({ target_id: target.id, name: target.name, status: 'synced', posts_found: inserted });
        processedIds.add(target.id);
        totalSynced++;
        totalNewPosts += inserted;
      }

      // Mark any target in the chunk that got no items back (still count as synced — nothing new)
      for (const t of chunk) {
        if (!processedIds.has(t.id)) {
          await supabase
            .from('engagement_targets')
            .update({ last_fetched_at: new Date().toISOString() })
            .eq('id', t.id);
          details.push({ target_id: t.id, name: t.name, status: 'synced', posts_found: 0 });
          processedIds.add(t.id);
          totalSynced++;
        }
      }
    }

    // Anything not processed this invocation
    const deferred = validTargets.filter((t: any) => !processedIds.has(t.id));
    for (const t of deferred) {
      details.push({ target_id: t.id, name: t.name, status: 'deferred', posts_found: 0 });
    }

    return new Response(
      JSON.stringify({
        success: true,
        batches: batchesRun,
        synced: totalSynced,
        failed: totalFailed,
        deferred: deferred.length,
        new_posts: totalNewPosts,
        details,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err: unknown) {
    console.error('fetch-target-posts-batch error:', err);
    return new Response(
      JSON.stringify({ success: false, error: err instanceof Error ? err.message : 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
