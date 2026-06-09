// =============================================================================
// fetch-target-posts — Fetch recent LinkedIn posts for an engagement target
//
// Uses the workspace's configured linkedin_scraper API key (RapidAPI).
// Provider-agnostic: swap the fetchPosts() implementation to change providers.
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
// Extract LinkedIn username from profile URL
// ---------------------------------------------------------------------------
function extractUsername(linkedinUrl: string): string | null {
  // Handles: linkedin.com/in/username, linkedin.com/in/username/, etc.
  const match = linkedinUrl.match(/linkedin\.com\/in\/([^/?#]+)/);
  return match ? match[1] : null;
}

// ---------------------------------------------------------------------------
// Provider: RapidAPI LinkedIn Data API (Z Real-Time Scraper)
// Endpoint: GET /get-profile-posts
// ---------------------------------------------------------------------------
async function fetchPostsRapidApi(
  username: string,
  apiKey: string,
  apiHost: string,
): Promise<FetchedPost[]> {
  const posts: FetchedPost[] = [];
  try {
    const url = `https://${apiHost}/get-profile-posts?username=${encodeURIComponent(username)}&start=0`;
    const res = await fetch(url, {
      headers: {
        'X-RapidAPI-Key': apiKey,
        'X-RapidAPI-Host': apiHost,
      },
    });

    if (!res.ok) {
      console.error(`RapidAPI fetch failed (${res.status})`);
      const text = await res.text();
      console.error(text);
      return posts;
    }

    const data = await res.json();
    // The response shape varies by provider — normalize here
    const items = data?.data || data?.posts || data?.elements || [];

    for (const item of items) {
      // Normalize across common RapidAPI LinkedIn scraper response formats
      const postUrl =
        item.postUrl || item.post_url || item.url ||
        (item.urn ? `https://www.linkedin.com/feed/update/${item.urn}` : null);

      if (!postUrl) continue;

      posts.push({
        linkedin_post_url: postUrl,
        linkedin_post_urn: item.urn || item.postUrn || item.post_urn || null,
        content: item.text || item.content || item.commentary || null,
        published_at: item.postedAt || item.published_at || item.postedDate || item.publishedAt || null,
        likes_count: item.totalReactionCount ?? item.likes ?? item.numLikes ?? 0,
        comments_count: item.commentsCount ?? item.comments ?? item.numComments ?? 0,
        shares_count: item.repostsCount ?? item.shares ?? item.numShares ?? 0,
        post_metadata: {
          images: item.images || item.image || [],
          video: item.video || null,
          article: item.article || null,
          author: item.author || item.authorName || null,
        },
      });
    }
  } catch (err) {
    console.error('RapidAPI fetch error:', err);
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

    const username = target.linkedin_username || extractUsername(target.linkedin_url);
    if (!username) {
      return new Response(
        JSON.stringify({ success: false, error: 'Could not extract LinkedIn username from URL' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Get the API key (linkedin_scraper service) ---
    const { data: keyRow } = await supabase
      .from('workspace_api_keys')
      .select('api_key_encrypted')
      .eq('workspace_id', workspace_id)
      .eq('service_name', 'linkedin_scraper')
      .eq('is_valid', true)
      .maybeSingle();

    if (!keyRow?.api_key_encrypted) {
      return new Response(
        JSON.stringify({ success: false, error: 'No linkedin_scraper API key configured. Add one in Intelligence > Settings.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Fetch posts from provider ---
    // Default to RapidAPI LinkedIn Data API host; configurable via workspace_api_keys metadata
    const apiHost = 'linkedin-data-api.p.rapidapi.com';
    const fetchedPosts = await fetchPostsRapidApi(username, keyRow.api_key_encrypted, apiHost);

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
    await supabase
      .from('engagement_targets')
      .update({ last_fetched_at: new Date().toISOString(), linkedin_username: username })
      .eq('id', target.id);

    console.log(`Fetched ${inserted} posts for target ${target.id} (${username})`);

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
