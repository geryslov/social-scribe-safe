// =============================================================================
// fetch-target-posts — Fetch recent LinkedIn posts for an engagement target
//
// Uses Apify actor "harvestapi/linkedin-profile-posts" (no cookies, PAYG).
// Workspace stores an Apify API token in workspace_api_keys (service: "apify").
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
// Normalise a LinkedIn profile URL to a clean format
// ---------------------------------------------------------------------------
function normaliseProfileUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  // Strip trailing slashes and query params
  url = url.replace(/\/+$/, '').split('?')[0];
  return url;
}

// ---------------------------------------------------------------------------
// Apify: harvestapi/linkedin-profile-posts  (sync endpoint)
//
// Docs: https://apify.com/harvestapi/linkedin-profile-posts/api
// Pricing: ~$1.50-2.00 per 1,000 posts, no cookies, no subscription
// ---------------------------------------------------------------------------
async function fetchPostsApify(
  profileUrl: string,
  apifyToken: string,
  maxPosts = 10,
): Promise<FetchedPost[]> {
  const posts: FetchedPost[] = [];

  try {
    // Sync endpoint — returns dataset items directly in the response
    const url = `https://api.apify.com/v2/acts/harvestapi~linkedin-profile-posts/run-sync-get-dataset-items?token=${apifyToken}`;

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
      console.error(`Apify call failed (${res.status}):`, errText);
      return posts;
    }

    const items: Record<string, unknown>[] = await res.json();

    for (const item of items) {
      // Skip non-post items (reactions/comments if they leak through)
      if (item.type && item.type !== 'post' && item.type !== 'repost') continue;

      const postUrl = (item.linkedinUrl as string) || '';
      if (!postUrl) continue;

      // Apify response fields:
      //   id, linkedinUrl, content, postedAt, type
      //   engagement.likes, engagement.comments, engagement.shares, engagement.reactions
      //   author.name, author.publicIdentifier, author.avatar
      //   postImages, document

      const engagement = (item.engagement || {}) as Record<string, unknown>;
      const author = (item.author || {}) as Record<string, unknown>;

      posts.push({
        linkedin_post_url: postUrl,
        linkedin_post_urn: item.id ? String(item.id) : null,
        content: (item.content as string) || null,
        published_at: (item.postedAt as string) || null,
        likes_count: (engagement.likes as number) ?? 0,
        comments_count: (engagement.comments as number) ?? 0,
        shares_count: (engagement.shares as number) ?? 0,
        post_metadata: {
          author_name: author.name || null,
          author_username: author.publicIdentifier || null,
          author_avatar: author.avatar || null,
          images: item.postImages || [],
          document: item.document || null,
          reactions: engagement.reactions || null,
          type: item.type || null,
        },
      });
    }
  } catch (err) {
    console.error('Apify fetch error:', err);
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

    // --- Fetch posts via Apify ---
    const profileUrl = normaliseProfileUrl(target.linkedin_url);
    const fetchedPosts = await fetchPostsApify(profileUrl, keyRow.api_key_encrypted, 10);

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
        .upsert(rows, { onConflict: 'workspace_id,linkedin_post_url', ignoreDuplicates: false })
        .select('id');

      if (insertErr) {
        console.error('Insert error:', insertErr);
      } else {
        inserted = result?.length ?? 0;
      }
    }

    // --- Update target last_fetched_at ---
    const username = target.linkedin_url.match(/linkedin\.com\/in\/([^/?#]+)/)?.[1] || null;
    await supabase
      .from('engagement_targets')
      .update({ last_fetched_at: new Date().toISOString(), linkedin_username: username })
      .eq('id', target.id);

    console.log(`Fetched ${inserted} posts for target ${target.id} via Apify`);

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
