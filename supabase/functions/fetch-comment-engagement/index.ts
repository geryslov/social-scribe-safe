// =============================================================================
// fetch-comment-engagement — Get reactions + replies on comments we posted
//
// Uses LinkedIn Social Metadata API:
//   GET /rest/socialMetadata/{commentUrn}
//   Returns: reactionSummaries (by type + count), commentSummary (reply count)
//
// Input:  { workspace_id, publisher_id }  (fetches all posted comments for this publisher)
// Output: { success, updated_count }
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

    // --- Get publisher's LinkedIn token ---
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

    // --- Get all posted comments with a linkedin_comment_urn ---
    const { data: comments, error: commentsErr } = await supabase
      .from('engagement_comments')
      .select('id, linkedin_comment_urn')
      .eq('workspace_id', workspace_id)
      .eq('publisher_id', publisher_id)
      .eq('status', 'posted')
      .not('linkedin_comment_urn', 'is', null);

    if (commentsErr) {
      console.error('Failed to fetch comments:', commentsErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch comments' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!comments || comments.length === 0) {
      return new Response(
        JSON.stringify({ success: true, updated_count: 0, message: 'No posted comments to check' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Fetching engagement for ${comments.length} comments`);

    let updatedCount = 0;

    // Batch in groups of 10 (LinkedIn batch limit)
    const BATCH_SIZE = 10;
    for (let i = 0; i < comments.length; i += BATCH_SIZE) {
      const batch = comments.slice(i, i + BATCH_SIZE);
      const urns = batch
        .map((c: { linkedin_comment_urn: string }) => c.linkedin_comment_urn)
        .filter(Boolean);

      if (urns.length === 0) continue;

      // Build batch request URL
      const encodedUrns = urns.map((u: string) => encodeURIComponent(u)).join(',');
      const url = `https://api.linkedin.com/rest/socialMetadata?ids=List(${encodedUrns})`;

      try {
        const res = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${tokenRow.linkedin_access_token}`,
            'Linkedin-Version': '202605',
            'X-Restli-Protocol-Version': '2.0.0',
            'X-RestLi-Method': 'BATCH_GET',
          },
        });

        if (!res.ok) {
          const errText = await res.text();
          console.error(`LinkedIn socialMetadata batch failed (${res.status}):`, errText.slice(0, 300));
          // Fall back to individual requests
          for (const comment of batch) {
            if (!comment.linkedin_comment_urn) continue;
            const updated = await fetchSingle(
              comment,
              tokenRow.linkedin_access_token,
              supabase,
            );
            if (updated) updatedCount++;
          }
          continue;
        }

        const data = await res.json();
        const results = data?.results || {};

        for (const comment of batch) {
          const urn = comment.linkedin_comment_urn;
          if (!urn) continue;

          const meta = results[urn];
          if (!meta) continue;

          // Parse reactions
          const reactionSummaries = meta.reactionSummaries || {};
          let totalReactions = 0;
          const breakdown: Record<string, number> = {};
          for (const [type, info] of Object.entries(reactionSummaries)) {
            const count = (info as { count: number }).count || 0;
            totalReactions += count;
            breakdown[type] = count;
          }

          // Parse replies
          const replyCount = meta.commentSummary?.count || 0;

          // Update DB
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
        }
      } catch (err) {
        console.error('Batch request error:', err);
      }
    }

    console.log(`Updated engagement for ${updatedCount} of ${comments.length} comments`);

    return new Response(
      JSON.stringify({ success: true, updated_count: updatedCount }),
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

// Fallback: fetch engagement for a single comment
async function fetchSingle(
  comment: { id: string; linkedin_comment_urn: string },
  accessToken: string,
  supabase: any,
): Promise<boolean> {
  try {
    const encoded = encodeURIComponent(comment.linkedin_comment_urn);
    const res = await fetch(`https://api.linkedin.com/rest/socialMetadata/${encoded}`, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Linkedin-Version': '202605',
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    if (!res.ok) return false;

    const meta = await res.json();
    const reactionSummaries = meta.reactionSummaries || {};
    let totalReactions = 0;
    const breakdown: Record<string, number> = {};
    for (const [type, info] of Object.entries(reactionSummaries)) {
      const count = (info as { count: number }).count || 0;
      totalReactions += count;
      breakdown[type] = count;
    }
    const replyCount = meta.commentSummary?.count || 0;

    const { error } = await supabase
      .from('engagement_comments')
      .update({
        reaction_count: totalReactions,
        reply_count: replyCount,
        reactions_breakdown: breakdown,
        engagement_fetched_at: new Date().toISOString(),
      })
      .eq('id', comment.id);

    return !error;
  } catch {
    return false;
  }
}
