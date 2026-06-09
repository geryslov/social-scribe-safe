// =============================================================================
// post-linkedin-comment — Post a comment on a LinkedIn post
//
// Uses the publisher's OAuth access token to comment via the official
// LinkedIn Community Management API (Comments endpoint).
//
// Input:  { workspace_id, publisher_id, post_id, comment_text }
// Output: { success, comment_urn }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workspace_id, publisher_id, post_id, comment_text, engagement_comment_id } = await req.json();

    if (!workspace_id || !publisher_id || !post_id || !comment_text) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id, publisher_id, post_id, and comment_text are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Get the publisher's LinkedIn token and member ID ---
    const { data: publisher, error: pubErr } = await supabase
      .from('publishers')
      .select('id, name, linkedin_member_id')
      .eq('id', publisher_id)
      .eq('workspace_id', workspace_id)
      .single();

    if (pubErr || !publisher) {
      return new Response(
        JSON.stringify({ success: false, error: 'Publisher not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Get token from publisher_tokens table
    const { data: tokenRow, error: tokenErr } = await supabase
      .from('publisher_tokens')
      .select('linkedin_access_token')
      .eq('publisher_id', publisher_id)
      .single();

    if (tokenErr || !tokenRow?.linkedin_access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Publisher has no LinkedIn access token. Reconnect via LinkedIn OAuth.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Get the engagement post to find the LinkedIn URN ---
    const { data: engPost, error: postErr } = await supabase
      .from('engagement_posts')
      .select('linkedin_post_urn, linkedin_post_url')
      .eq('id', post_id)
      .eq('workspace_id', workspace_id)
      .single();

    if (postErr || !engPost) {
      return new Response(
        JSON.stringify({ success: false, error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // We need an activity URN to comment. Try to extract from post_urn or URL.
    let activityUrn = engPost.linkedin_post_urn;

    // If we have a URL but no URN, try to extract from URL pattern
    if (!activityUrn && engPost.linkedin_post_url) {
      const urnMatch = engPost.linkedin_post_url.match(/(urn:li:(?:activity|ugcPost|share):\d+)/);
      if (urnMatch) {
        activityUrn = urnMatch[1];
      }
      // Try extracting from /feed/update/ URL
      const feedMatch = engPost.linkedin_post_url.match(/\/feed\/update\/(urn%3Ali%3A(?:activity|ugcPost|share)%3A\d+)/);
      if (feedMatch) {
        activityUrn = decodeURIComponent(feedMatch[1]);
      }
    }

    if (!activityUrn) {
      // Mark as failed if we have an engagement_comment_id
      if (engagement_comment_id) {
        await supabase.from('engagement_comments').update({
          status: 'failed',
          error_message: 'Could not determine LinkedIn post URN. Comment cannot be posted.',
        }).eq('id', engagement_comment_id);
      }
      return new Response(
        JSON.stringify({ success: false, error: 'Could not determine LinkedIn post URN from stored data' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Post comment via LinkedIn Community Management API ---
    const personUrn = `urn:li:person:${publisher.linkedin_member_id}`;
    const encodedUrn = encodeURIComponent(activityUrn);

    const linkedinRes = await fetch(
      `https://api.linkedin.com/v2/socialActions/${encodedUrn}/comments`,
      {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenRow.linkedin_access_token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({
          actor: personUrn,
          object: activityUrn,
          message: { text: comment_text },
        }),
      },
    );

    if (!linkedinRes.ok) {
      const errBody = await linkedinRes.text();
      console.error(`LinkedIn comment failed (${linkedinRes.status}):`, errBody);

      let friendly = `LinkedIn API ${linkedinRes.status}: ${errBody.slice(0, 300)}`;
      if (linkedinRes.status === 403) {
        friendly = 'LinkedIn denied the comment (403). The publisher token is missing the w_member_social scope, or LinkedIn does not allow commenting on this post via the API. Reconnect the publisher to LinkedIn.';
      } else if (linkedinRes.status === 401) {
        friendly = 'LinkedIn access token is expired or invalid. Please reconnect the publisher.';
      }

      // Update engagement_comment status to failed
      if (engagement_comment_id) {
        await supabase.from('engagement_comments').update({
          status: 'failed',
          error_message: friendly,
        }).eq('id', engagement_comment_id);
      }

      return new Response(
        JSON.stringify({ success: false, error: friendly, linkedin_status: linkedinRes.status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const commentData = await linkedinRes.json();
    const commentUrn = commentData.commentUrn || null;
    const commentId = commentData.id || null;

    // --- Update engagement_comment record ---
    if (engagement_comment_id) {
      await supabase.from('engagement_comments').update({
        status: 'posted',
        linkedin_comment_urn: commentUrn,
        posted_at: new Date().toISOString(),
      }).eq('id', engagement_comment_id);
    }

    console.log(`Comment posted by ${publisher.name} on ${activityUrn}: ${commentId}`);

    return new Response(
      JSON.stringify({
        success: true,
        comment_urn: commentUrn,
        comment_id: commentId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('post-linkedin-comment error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to post comment';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
