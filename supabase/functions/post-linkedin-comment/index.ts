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

    // --- Post comment via LinkedIn v2 socialActions API ---
    const personUrn = `urn:li:person:${publisher.linkedin_member_id}`;

    // /v2/socialActions accepts ugcPost or share URNs, NOT activity URNs.
    let numericId: string | null = null;
    const urnDigits = String(activityUrn).match(/(\d{10,})/);
    if (urnDigits) numericId = urnDigits[1];

    const candidates: string[] = [];
    if (typeof activityUrn === 'string' &&
        (activityUrn.startsWith('urn:li:ugcPost:') || activityUrn.startsWith('urn:li:share:'))) {
      candidates.push(activityUrn);
    }
    if (numericId) {
      candidates.push(`urn:li:ugcPost:${numericId}`);
      candidates.push(`urn:li:share:${numericId}`);
      candidates.push(`urn:li:activity:${numericId}`);
    }
    const tryUrns = [...new Set(candidates)];
    console.log(`Trying ${tryUrns.length} URN variants for activityUrn="${activityUrn}":`, tryUrns);

    if (tryUrns.length === 0) {
      const msg = `Could not parse a numeric LinkedIn post ID from "${activityUrn}".`;
      if (engagement_comment_id) {
        await supabase.from('engagement_comments').update({
          status: 'failed', error_message: msg,
        }).eq('id', engagement_comment_id);
      }
      return new Response(
        JSON.stringify({ success: false, error: msg }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    let linkedinRes: Response | null = null;
    let lastErrBody = '';
    let usedUrn = '';

    for (const urn of tryUrns) {
      const encoded = encodeURIComponent(urn);
      const res = await fetch(
        `https://api.linkedin.com/v2/socialActions/${encoded}/comments`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokenRow.linkedin_access_token}`,
            'Content-Type': 'application/json',
            'X-Restli-Protocol-Version': '2.0.0',
          },
          body: JSON.stringify({
            actor: personUrn,
            object: urn,
            message: { text: comment_text },
          }),
        },
      );

      if (res.ok) {
        linkedinRes = res;
        usedUrn = urn;
        break;
      }

      lastErrBody = await res.text();
      console.warn(`Comment attempt failed for ${urn} (${res.status}): ${lastErrBody.slice(0, 200)}`);
      linkedinRes = res;

      // LinkedIn sometimes reveals the actual threadUrn in the error body. Try it.
      const actualUrnMatch = lastErrBody.match(/actual threadUrn:\s*(urn:li:(?:ugcPost|share|activity):\d+)/);
      if (actualUrnMatch && !tryUrns.includes(actualUrnMatch[1])) {
        const actualUrn = actualUrnMatch[1];
        console.log(`LinkedIn revealed actual URN: ${actualUrn}. Retrying...`);
        const encoded2 = encodeURIComponent(actualUrn);
        const res2 = await fetch(
          `https://api.linkedin.com/v2/socialActions/${encoded2}/comments`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${tokenRow.linkedin_access_token}`,
              'Content-Type': 'application/json',
              'X-Restli-Protocol-Version': '2.0.0',
            },
            body: JSON.stringify({
              actor: personUrn,
              object: actualUrn,
              message: { text: comment_text },
            }),
          },
        );
        if (res2.ok) {
          linkedinRes = res2;
          usedUrn = actualUrn;
          break;
        }
        lastErrBody = await res2.text();
        linkedinRes = res2;
        console.warn(`Retry with revealed URN ${actualUrn} also failed (${res2.status}): ${lastErrBody.slice(0, 200)}`);
      }

      // Only retry on 400 (wrong URN type). Stop on auth/permission errors.
      if (res.status !== 400 && res.status !== 404) break;
    }

    if (!linkedinRes || !linkedinRes.ok) {
      const status = linkedinRes?.status ?? 500;
      console.error(`LinkedIn comment failed (${status}) after trying ${tryUrns.length} URN variants:`, lastErrBody);

      let friendly = `LinkedIn API ${status}: ${lastErrBody.slice(0, 300)}`;
      if (status === 403) {
        friendly = 'LinkedIn denied the comment (403). The publisher token is missing the w_member_social scope. Reconnect the publisher to LinkedIn.';
      } else if (status === 401) {
        friendly = 'LinkedIn access token is expired or invalid. Please reconnect the publisher.';
      } else if (status === 400) {
        friendly = `LinkedIn rejected the post URN (${activityUrn}). It may be a repost, a comment, or a deleted post that cannot be commented on via the API.`;
      }

      if (engagement_comment_id) {
        await supabase.from('engagement_comments').update({
          status: 'failed',
          error_message: friendly,
        }).eq('id', engagement_comment_id);
      }

      return new Response(
        JSON.stringify({ success: false, error: friendly, linkedin_status: status }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Comment posted successfully using URN: ${usedUrn}`);

    const commentData = await linkedinRes.json();
    const commentId = commentData.id || linkedinRes.headers.get('x-restli-id') || null;
    // LinkedIn comment URN format: urn:li:comment:(urn:li:activity:XXX,commentId)
    let commentUrn = commentData.$URN || commentData.commentUrn || null;
    if (!commentUrn && commentId) {
      commentUrn = `urn:li:comment:(${usedUrn},${commentId})`;
    }

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
