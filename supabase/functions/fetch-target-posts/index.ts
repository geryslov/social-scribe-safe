// =============================================================================
// fetch-target-posts — Fetch recent LinkedIn posts for an engagement target
//
// Uses Apify actor "harvestapi/linkedin-profile-posts" (no cookies, PAYG).
// Workspace stores an Apify API token in workspace_api_keys (service: "apify").
//
// Flow: start actor run → poll until finished → fetch dataset items.
//
// Input:  { workspace_id, target_id }
// Output: { success, posts_found }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface FetchedPost {
  linkedin_post_url: string;
  linkedin_post_urn: string | null;
  content: string | null;
  published_at: string | null;
  likes_count: number;
  comments_count: number;
  shares_count: number;
  post_metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Normalise a LinkedIn profile URL
// ---------------------------------------------------------------------------
function normaliseProfileUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  url = url.replace(/\/+$/, '').split('?')[0];
  // Ensure it ends with a trailing slash (some actors need this)
  if (!url.endsWith('/')) url += '/';
  return url;
}

// ---------------------------------------------------------------------------
// Sleep helper
// ---------------------------------------------------------------------------
function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// ---------------------------------------------------------------------------
// Apify: harvestapi/linkedin-profile-posts
//
// Step 1: Start run (async)
// Step 2: Poll run status until SUCCEEDED/FAILED/TIMED-OUT
// Step 3: Fetch dataset items
// ---------------------------------------------------------------------------

const APIFY_ACTOR = 'harvestapi~linkedin-profile-posts';
const APIFY_BASE = 'https://api.apify.com/v2';

async function startApifyRun(
  profileUrl: string,
  apifyToken: string,
  maxPosts: number,
): Promise<string | null> {
  const url = `${APIFY_BASE}/acts/${APIFY_ACTOR}/runs?token=${apifyToken}`;

  console.log('Starting Apify run for:', profileUrl);

  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      targetUrls: [profileUrl],
      maxPosts,
      scrapeReactions: false,
      scrapeComments: false,
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    console.error(`Apify start failed (${res.status}):`, errText);
    return null;
  }

  const data = await res.json();
  const runId = data?.data?.id;
  console.log('Apify run started:', runId);
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

    if (status === 'SUCCEEDED') {
      return { status, datasetId };
    }
    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
      return { status, datasetId: null };
    }

    // Still running — wait 3 seconds before next poll
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

  // Log first item structure for debugging
  if (Array.isArray(items) && items.length > 0) {
    console.log('First item keys:', Object.keys(items[0]));
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

function parseApifyItems(items: Record<string, unknown>[]): FetchedPost[] {
  const posts: FetchedPost[] = [];

  for (const item of items) {
    // Skip non-post items
    const itemType = item.type as string | undefined;
    if (itemType && itemType !== 'post' && itemType !== 'repost' && itemType !== 'share') continue;

    // Try multiple possible URL field names
    const postUrl =
      (item.linkedinUrl as string) ||
      (item.postUrl as string) ||
      (item.url as string) ||
      (item.link as string) ||
      '';

    if (!postUrl) {
      console.log('Skipping item with no URL, keys:', Object.keys(item));
      continue;
    }

    // Engagement — try nested object or flat fields
    const engagement = (item.engagement || {}) as Record<string, unknown>;
    const likes = (engagement.likes as number) ?? (item.likes as number) ?? (item.numLikes as number) ?? 0;
    const comments = (engagement.comments as number) ?? (item.comments as number) ?? (item.numComments as number) ?? 0;
    const shares = (engagement.shares as number) ?? (item.shares as number) ?? (item.numShares as number) ?? 0;

    // Author info
    const author = (item.author || {}) as Record<string, unknown>;

    // Post ID — try multiple field names
    const postId = (item.id as string) || (item.postId as string) || (item.urn as string) || null;

    posts.push({
      linkedin_post_url: postUrl,
      linkedin_post_urn: postId,
      content: (item.content as string) || (item.text as string) || (item.commentary as string) || null,
      published_at: parseTimestamp(item.postedAt) || parseTimestamp(item.publishedAt) || parseTimestamp(item.postedDate) || null,
      likes_count: likes,
      comments_count: comments,
      shares_count: shares,
      post_metadata: {
        author_name: author.name || null,
        author_username: author.publicIdentifier || null,
        author_avatar: author.avatar || null,
        images: item.postImages || item.images || [],
        document: item.document || null,
        reactions: engagement.reactions || null,
        type: itemType || null,
      },
    });
  }

  return posts;
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
      .select('id, linkedin_url, linkedin_username, workspace_id')
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

    // --- Step 1: Start the Apify run ---
    const runId = await startApifyRun(profileUrl, apifyToken, 2);
    if (!runId) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to start Apify run. Check your API token.' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Step 2: Poll until done (max ~50s to stay within Edge Function timeout) ---
    const { status, datasetId } = await pollApifyRun(runId, apifyToken, 50000);

    if (status !== 'SUCCEEDED' || !datasetId) {
      return new Response(
        JSON.stringify({ success: false, error: `Apify run ${status}. Run ID: ${runId}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Step 3: Fetch dataset items ---
    const rawItems = await fetchApifyDataset(datasetId, apifyToken);
    const fetchedPosts = parseApifyItems(rawItems);

    console.log(`Parsed ${fetchedPosts.length} posts from ${rawItems.length} raw items`);

    // --- Upsert into engagement_posts ---
    let inserted = 0;
    if (fetchedPosts.length > 0) {
      const rows = fetchedPosts.map((p) => ({
        workspace_id,
        target_id: target.id,
        linkedin_post_urn: p.linkedin_post_urn,
        linkedin_post_url: p.linkedin_post_url,
        content: p.content,
        published_at: p.published_at,
        likes_count: p.likes_count,
        comments_count: p.comments_count,
        shares_count: p.shares_count,
        post_metadata: p.post_metadata,
      }));

      const { data: result, error: insertErr } = await supabase
        .from('engagement_posts')
        .upsert(rows, { onConflict: 'target_id,linkedin_post_urn', ignoreDuplicates: false })
        .select('id');

      if (insertErr) {
        console.error('Insert error:', insertErr);
      } else {
        inserted = result?.length ?? 0;
      }
    }

    // --- Extract profile data from first post's author info ---
    const username = target.linkedin_url.match(/linkedin\.com\/in\/([^/?#]+)/)?.[1] || null;
    const targetUpdate: Record<string, unknown> = {
      last_fetched_at: new Date().toISOString(),
      linkedin_username: username,
    };

    // Try to get author info from Apify response (first raw item)
    if (rawItems.length > 0) {
      const firstItem = rawItems[0];
      const author = (firstItem.author || {}) as Record<string, unknown>;
      if (author.avatar && typeof author.avatar === 'string') {
        targetUpdate.avatar_url = author.avatar;
      }
      // Build headline from author info
      const authorInfo = (author.info as string) || '';
      if (authorInfo) {
        targetUpdate.headline = authorInfo;
      }
    }

    await supabase
      .from('engagement_targets')
      .update(targetUpdate)
      .eq('id', target.id);

    console.log(`Done: ${inserted} posts stored for target ${target.id}`);

    return new Response(
      JSON.stringify({ success: true, posts_found: inserted }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('fetch-target-posts error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch posts';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
