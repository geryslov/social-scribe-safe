// =============================================================================
// fetch-target-comments — Fetch a target's comments on OTHER people's posts
//
// Complements fetch-target-posts. Where that pulls a target's own posts, this
// pulls the comments the target has left on other people's posts — their
// outbound comment activity — so the publisher can jump into the same threads.
//
// Uses Apify actor "harvestapi/linkedin-profile-comments" (no cookies, PAYG,
// same developer as the profile-posts actor). Bills per comment returned.
//
// Workspace stores an Apify API token in workspace_api_keys (service: "apify").
//
// Flow: start actor run → poll until finished → fetch dataset items → upsert.
//
// Input:  { workspace_id, target_id }
// Output: { success, comments_found }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchedComment {
  dedup_key: string;
  comment_urn: string | null;
  comment_url: string | null;
  comment_text: string | null;
  commented_at: string | null;
  reactions_count: number;
  parent_post_url: string | null;
  parent_post_urn: string | null;
  parent_post_author_name: string | null;
  parent_post_author_headline: string | null;
  parent_post_author_url: string | null;
  parent_post_content: string | null;
  parent_post_published_at: string | null;
  comment_metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Normalise a LinkedIn profile URL
// ---------------------------------------------------------------------------
function normaliseProfileUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  url = url.replace(/\/+$/, '').split('?')[0];
  if (!url.endsWith('/')) url += '/';
  return url;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Apify: harvestapi/linkedin-profile-comments
//   Input: { profiles: [url], maxItems, postedLimit }
//   postedLimit is a coarse enum: any | 24h | week | month | 3months | ...
// ---------------------------------------------------------------------------

const APIFY_ACTOR = 'harvestapi~linkedin-profile-comments';
const APIFY_BASE = 'https://api.apify.com/v2';

async function startApifyRun(
  profileUrl: string,
  apifyToken: string,
  maxItems: number,
  postedLimit: string,
): Promise<string | null> {
  const url = `${APIFY_BASE}/acts/${APIFY_ACTOR}/runs?token=${apifyToken}`;

  console.log('Starting Apify comments run for:', profileUrl, 'window:', postedLimit);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profiles: [profileUrl],
      maxItems,
      postedLimit,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Apify start failed (${res.status}):`, errText);
    return null;
  }

  const data = await res.json();
  const runId = data?.data?.id;
  console.log('Apify comments run started:', runId);
  return runId || null;
}

async function pollApifyRun(
  runId: string,
  apifyToken: string,
  maxWaitMs = 50000,
): Promise<{ status: string; datasetId: string | null }> {
  const startTime = Date.now();

  while (Date.now() - startTime < maxWaitMs) {
    const url = `${APIFY_BASE}/actor-runs/${runId}?token=${apifyToken}`;
    const res = await fetch(url);

    if (!res.ok) {
      console.error(`Apify poll failed (${res.status})`);
      return { status: 'FAILED', datasetId: null };
    }

    const data = await res.json();
    const status = data?.data?.status;
    const datasetId = data?.data?.defaultDatasetId;

    console.log(`Apify run ${runId} status: ${status}`);

    if (status === 'SUCCEEDED') return { status, datasetId };
    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
      return { status, datasetId: null };
    }

    await sleep(3000);
  }

  console.error('Apify polling timed out');
  return { status: 'POLL_TIMEOUT', datasetId: null };
}

async function fetchApifyDataset(
  datasetId: string,
  apifyToken: string,
): Promise<Record<string, unknown>[]> {
  const url = `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&format=json`;
  const res = await fetch(url);

  if (!res.ok) {
    console.error(`Apify dataset fetch failed (${res.status})`);
    return [];
  }

  const items = await res.json();
  console.log(`Apify dataset returned ${Array.isArray(items) ? items.length : 0} items`);
  if (Array.isArray(items) && items.length > 0) {
    console.log('First comment item keys:', Object.keys(items[0]));
  }
  return Array.isArray(items) ? items : [];
}

function parseTimestamp(v: unknown): string | null {
  if (!v) return null;
  if (typeof v === 'string') {
    const d = new Date(v);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (typeof v === 'number') {
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

function str(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v : null;
}

// Different Apify actors name fields differently. Pull the target's comment plus
// the parent post it was left on, trying several shapes, and keep the raw item.
function parseApifyItems(items: Record<string, unknown>[]): FetchedComment[] {
  const out: FetchedComment[] = [];

  for (const item of items) {
    // --- The comment itself (harvestapi/linkedin-profile-comments schema) ---
    // Comment text lives in `commentary`; the comment id is `id`; the permalink
    // is `linkedinUrl`; the timestamp is `createdAt` (ISO) / `createdAtTimestamp`.
    const commentText = str(item.commentary) || str(item.commentText) || str(item.text) || null;
    const commentUrn = str(item.id) || str(item.commentUrn) || str(item.urn) || null;
    const commentUrl = str(item.linkedinUrl) || str(item.commentUrl) || str(item.url) || null;
    const commentedAt =
      parseTimestamp(item.createdAt) || parseTimestamp(item.createdAtTimestamp) ||
      parseTimestamp(item.commentedAt) || null;

    // Reactions on the comment = engagement.likes.
    const engagement = (item.engagement || {}) as Record<string, unknown>;
    const reactions = typeof engagement.likes === 'number' ? engagement.likes : 0;

    // --- The post the comment was left ON ---
    const post = (item.post || {}) as Record<string, unknown>;
    const postAuthor = (post.author || {}) as Record<string, unknown>;

    const parentPostUrl = str(post.linkedinUrl) || str(post.shareLinkedinUrl) || null;
    const parentPostUrn = str(post.shareUrn) || str(post.entityId) || str(post.id) || null;
    const parentPostContent = str(post.content) || null;
    const parentAuthorName = str(postAuthor.name) || null;
    const parentAuthorHeadline = str(postAuthor.info) || null;
    const parentAuthorUrl = str(postAuthor.linkedinUrl) || null;
    // post.postedAt is an object { date, timestamp }; parseTimestamp reads either.
    const parentPublishedAt = parseTimestamp(post.postedAt) || null;

    // Stable dedup key: the comment id is always present and unique.
    const dedupKey =
      commentUrn ||
      commentUrl ||
      (commentText ? `${commentText.slice(0, 80)}#${commentedAt ?? ''}` : null);

    if (!dedupKey) {
      console.log('Skipping comment item with no identifiable key, keys:', Object.keys(item));
      continue;
    }

    out.push({
      dedup_key: dedupKey,
      comment_urn: commentUrn,
      comment_url: commentUrl,
      comment_text: commentText,
      commented_at: commentedAt,
      reactions_count: typeof reactions === 'number' ? reactions : 0,
      parent_post_url: parentPostUrl,
      parent_post_urn: parentPostUrn,
      parent_post_author_name: parentAuthorName,
      parent_post_author_headline: parentAuthorHeadline,
      parent_post_author_url: parentAuthorUrl,
      parent_post_content: parentPostContent,
      parent_post_published_at: parentPublishedAt,
      comment_metadata: { raw: item },
    });
  }

  return out;
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workspace_id, target_id } = await req.json();

    if (!workspace_id || !target_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id and target_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Fetch the target ---
    const { data: target, error: targetErr } = await supabase
      .from('engagement_targets')
      .select('id, linkedin_url, workspace_id, last_comments_fetched_at')
      .eq('id', target_id)
      .eq('workspace_id', workspace_id)
      .single();

    if (targetErr || !target) {
      return new Response(
        JSON.stringify({ success: false, error: 'Target not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Get the Apify API token ---
    const { data: keyRow } = await supabase
      .from('workspace_api_keys')
      .select('api_key_encrypted')
      .eq('workspace_id', workspace_id)
      .eq('service_name', 'apify')
      .eq('is_valid', true)
      .maybeSingle();

    if (!keyRow?.api_key_encrypted) {
      return new Response(
        JSON.stringify({ success: false, error: 'No Apify API token configured. Add one in Intelligence > Settings (service: apify).' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apifyToken = keyRow.api_key_encrypted;
    const profileUrl = normaliseProfileUrl(target.linkedin_url);

    // Single/manual fetch always pulls a month so one click returns a useful set
    // (the daily batch stays on a tighter window for cost). The (target_id,
    // dedup_key) unique constraint absorbs any overlap.
    const postedLimit = 'month';

    // --- Step 1: Start the Apify run ---
    const runId = await startApifyRun(profileUrl, apifyToken, 25, postedLimit);
    if (!runId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to start Apify run. Check your API token.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Step 2: Poll until done ---
    const { status, datasetId } = await pollApifyRun(runId, apifyToken, 50000);
    if (status !== 'SUCCEEDED' || !datasetId) {
      return new Response(
        JSON.stringify({ success: false, error: `Apify run ${status}. Run ID: ${runId}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Step 3: Fetch dataset items ---
    const rawItems = await fetchApifyDataset(datasetId, apifyToken);
    const fetched = parseApifyItems(rawItems);
    console.log(`Parsed ${fetched.length} comments from ${rawItems.length} raw items`);

    // --- Upsert into engagement_target_comments ---
    let inserted = 0;
    if (fetched.length > 0) {
      const rows = fetched.map((c) => ({
        workspace_id,
        target_id: target.id,
        ...c,
      }));

      const { data: result, error: insertErr } = await supabase
        .from('engagement_target_comments')
        .upsert(rows, { onConflict: 'target_id,dedup_key', ignoreDuplicates: false })
        .select('id');

      if (insertErr) {
        console.error('Insert error:', insertErr);
      } else {
        inserted = result?.length ?? 0;
      }
    }

    // --- Stamp last fetch ---
    await supabase
      .from('engagement_targets')
      .update({ last_comments_fetched_at: new Date().toISOString() })
      .eq('id', target.id);

    return new Response(
      JSON.stringify({ success: true, comments_found: inserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('fetch-target-comments error:', err);
    return new Response(
      JSON.stringify({ success: false, error: String(err) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
