// =============================================================================
// fetch-comment-engagement — Get reactions + replies on comments we posted
//
// LinkedIn does NOT provide impressions for individual comments via the public
// API. We can only fetch:
//   - reactions (likesSummary.totalLikes) via GET /v2/socialActions/{commentUrn}
//   - reply count (via GET /v2/socialActions/{commentUrn}/comments?count=0)
//
// Comment URNs are compound: urn:li:comment:(urn:li:activity:XXX,YYY)
// They must be fully URL-encoded as one path segment.
//
// Input:  { workspace_id, publisher_id }
// Output: { success, updated_count, missing_urn_count, message }
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
    const { workspace_id, publisher_id } = await req.json();

    if (!workspace_id || !publisher_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id and publisher_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: tokenRow, error: tokenErr } = await supabase
      .from('publisher_tokens')
      .select('linkedin_access_token')
      .eq('publisher_id', publisher_id)
      .single();

    if (tokenErr || !tokenRow?.linkedin_access_token) {
      return new Response(
        JSON.stringify({ success: false, error: 'Publisher has no LinkedIn access token' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { data: allPosted, error: allErr } = await supabase
      .from('engagement_comments')
      .select('id, linkedin_comment_urn, status')
      .eq('workspace_id', workspace_id)
      .eq('publisher_id', publisher_id)
      .eq('status', 'posted');

    if (allErr) {
      console.error('Failed to fetch comments:', allErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch comments' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const totalPosted = allPosted?.length || 0;
    const comments = (allPosted || []).filter((c: any) => c.linkedin_comment_urn);
    const missingUrnCount = totalPosted - comments.length;

    console.log(`Posted: ${totalPosted}, with URN: ${comments.length}, missing URN: ${missingUrnCount}`);

    if (comments.length === 0) {
      const msg = totalPosted === 0
        ? 'No posted comments to check'
        : `${totalPosted} posted comments, but none have a LinkedIn comment URN saved. LinkedIn didn't return the comment ID when posting — engagement can't be fetched. Re-post or check publisher's LinkedIn token scopes.`;
      return new Response(
        JSON.stringify({ success: true, updated_count: 0, missing_urn_count: missingUrnCount, message: msg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = tokenRow.linkedin_access_token;
    let updatedCount = 0;
    let lastError = '';

    for (const comment of comments) {
      const urn = comment.linkedin_comment_urn as string;
      const encoded = encodeURIComponent(urn);

      try {
        // 1) Fetch the comment itself → likesSummary
        const commentRes = await fetch(
          `https://api.linkedin.com/v2/socialActions/${encoded}`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          },
        );

        let totalReactions = 0;
        const breakdown: Record<string, number> = {};

        if (commentRes.ok) {
          const meta = await commentRes.json();
          totalReactions = meta?.likesSummary?.totalLikes
            ?? meta?.likesSummary?.aggregatedTotalLikes
            ?? 0;
          // v2 endpoint does NOT break down by reaction type — only totalLikes.
        } else {
          const t = await commentRes.text();
          lastError = `GET socialActions/${urn} → ${commentRes.status}: ${t.slice(0, 200)}`;
          console.warn(lastError);
        }

        // 2) Fetch reply count via paged comments endpoint with count=0
        let replyCount = 0;
        const repliesRes = await fetch(
          `https://api.linkedin.com/v2/socialActions/${encoded}/comments?count=0`,
          {
            headers: {
              'Authorization': `Bearer ${token}`,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          },
        );
        if (repliesRes.ok) {
          const r = await repliesRes.json();
          replyCount = r?.paging?.total ?? r?.elements?.length ?? 0;
        } else {
          const t = await repliesRes.text();
          console.warn(`GET replies for ${urn} → ${repliesRes.status}: ${t.slice(0, 200)}`);
        }

        const { error: updateErr } = await supabase
          .from('engagement_comments')
          .update({
            reaction_count: totalReactions,
            reply_count: replyCount,
            reactions_breakdown: breakdown,
            engagement_fetched_at: new Date().toISOString(),
          })
          .eq('id', comment.id);

        if (!updateErr) updatedCount++;
      } catch (err) {
        console.error(`Error processing ${urn}:`, err);
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    console.log(`Updated engagement for ${updatedCount} of ${comments.length} comments`);

    const message = updatedCount > 0
      ? undefined
      : `Could not fetch engagement for ${comments.length} comment(s). Last error: ${lastError || 'unknown'}`;

    return new Response(
      JSON.stringify({
        success: true,
        updated_count: updatedCount,
        missing_urn_count: missingUrnCount,
        message,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('fetch-comment-engagement error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to fetch engagement';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
