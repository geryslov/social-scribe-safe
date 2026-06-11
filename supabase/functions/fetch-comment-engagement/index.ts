// =============================================================================
// fetch-comment-engagement — Get reactions + replies on comments we posted,
// and store the actors who reacted/replied so we can show details in the UI.
//
// LinkedIn does NOT provide impressions for individual comments.
// We fetch:
//   - reactions on the comment via GET /v2/reactions/(entity:{encoded urn})
//   - replies (sub-comments) via GET /v2/socialActions/{encoded urn}/comments
//
// Input:  { workspace_id, publisher_id }
// Output: { success, updated_count, missing_urn_count, message }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LI_HEADERS = (token: string) => ({
  'Authorization': `Bearer ${token}`,
  'X-Restli-Protocol-Version': '2.0.0',
  'LinkedIn-Version': '202401',
});

async function resolvePersons(urns: string[], token: string): Promise<Record<string, { name: string; headline: string | null; profileUrl: string | null; avatarUrl: string | null }>> {
  const out: Record<string, any> = {};
  const unique = [...new Set(urns)].filter((u) => u?.startsWith('urn:li:person:'));
  // best-effort: fetch each individually (batch endpoint requires versioned API + scopes)
  for (const urn of unique) {
    const id = urn.split(':').pop();
    try {
      const r = await fetch(`https://api.linkedin.com/v2/people/(id:${id})?projection=(id,localizedFirstName,localizedLastName,headline,vanityName,profilePicture(displayImage~:playableStreams))`, {
        headers: LI_HEADERS(token),
      });
      if (r.ok) {
        const p = await r.json();
        const first = p.localizedFirstName || '';
        const last = p.localizedLastName || '';
        const name = `${first} ${last}`.trim() || 'LinkedIn member';
        const vanity = p.vanityName;
        const avatar = p?.profilePicture?.['displayImage~']?.elements?.[0]?.identifiers?.[0]?.identifier ?? null;
        out[urn] = {
          name,
          headline: typeof p.headline === 'string' ? p.headline : (p.headline?.localized?.en_US ?? null),
          profileUrl: vanity ? `https://www.linkedin.com/in/${vanity}` : null,
          avatarUrl: avatar,
        };
      } else {
        out[urn] = { name: 'LinkedIn member', headline: null, profileUrl: null, avatarUrl: null };
      }
    } catch {
      out[urn] = { name: 'LinkedIn member', headline: null, profileUrl: null, avatarUrl: null };
    }
  }
  return out;
}

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
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch comments' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const totalPosted = allPosted?.length || 0;
    const comments = (allPosted || []).filter((c: any) => c.linkedin_comment_urn);
    const missingUrnCount = totalPosted - comments.length;

    if (comments.length === 0) {
      const msg = totalPosted === 0
        ? 'No posted comments to check'
        : `${totalPosted} posted comments, but none have a LinkedIn comment URN saved.`;
      return new Response(
        JSON.stringify({ success: true, updated_count: 0, missing_urn_count: missingUrnCount, message: msg }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const token = tokenRow.linkedin_access_token;
    let updatedCount = 0;
    let lastError = '';

    // LinkedIn REST requires full encoding of (, ), and , in URN path/query params.
    const encodeUrn = (u: string) =>
      encodeURIComponent(u)
        .replace(/\(/g, '%28')
        .replace(/\)/g, '%29')
        .replace(/,/g, '%2C')
        .replace(/'/g, '%27');

    for (const comment of comments) {
      const urn = comment.linkedin_comment_urn as string;
      const encoded = encodeUrn(urn);



      try {
        // -------- Reactions on the comment --------
        let totalReactions = 0;
        const breakdown: Record<string, number> = {};
        const reactors: Array<{ actor_urn: string; reaction_type: string; reacted_at: number | null }> = [];

        // Aggregate count (preferred — always available)
        const summaryRes = await fetch(`https://api.linkedin.com/v2/socialActions/${encoded}`, { headers: LI_HEADERS(token) });
        if (summaryRes.ok) {
          const meta = await summaryRes.json();
          totalReactions = meta?.likesSummary?.totalLikes ?? meta?.likesSummary?.aggregatedTotalLikes ?? 0;
        } else {
          lastError = `GET socialActions/${urn} → ${summaryRes.status}`;
        }

        // Detailed reactors (requires r_member_social or community management product)
        let nextStart = 0;
        for (let page = 0; page < 5; page++) {
          const rRes = await fetch(
            `https://api.linkedin.com/v2/reactions/(entity:${encoded})?q=entity&count=50&start=${nextStart}`,
            { headers: LI_HEADERS(token) },
          );
          if (!rRes.ok) break;
          const rJson = await rRes.json();
          const els = rJson?.elements || [];
          for (const el of els) {
            const actor = el?.created?.actor || el?.actor;
            if (!actor) continue;
            reactors.push({
              actor_urn: actor,
              reaction_type: el?.reactionType || 'LIKE',
              reacted_at: el?.created?.time ?? null,
            });
            const t = el?.reactionType || 'LIKE';
            breakdown[t] = (breakdown[t] || 0) + 1;
          }
          if (els.length < 50) break;
          nextStart += 50;
        }

        // -------- Replies (sub-comments) --------
        let replyCount = 0;
        const replies: Array<{ reply_urn: string; actor_urn: string; reply_text: string | null; replied_at: number | null }> = [];

        for (let page = 0; page < 5; page++) {
          const repRes = await fetch(
            `https://api.linkedin.com/v2/socialActions/${encoded}/comments?count=50&start=${page * 50}`,
            { headers: LI_HEADERS(token) },
          );
          if (!repRes.ok) {
            if (page === 0) {
              const t = await repRes.text();
              console.warn(`replies ${urn} → ${repRes.status}: ${t.slice(0, 200)}`);
            }
            break;
          }
          const rj = await repRes.json();
          const els = rj?.elements || [];
          if (page === 0) replyCount = rj?.paging?.total ?? els.length;
          for (const el of els) {
            const replyUrn = el?.$URN || el?.urn || `${urn}#${el?.id ?? el?.created?.time}`;
            replies.push({
              reply_urn: replyUrn,
              actor_urn: el?.actor,
              reply_text: el?.message?.text ?? null,
              replied_at: el?.created?.time ?? null,
            });
          }
          if (els.length < 50) break;
        }
        if (replyCount === 0 && replies.length > 0) replyCount = replies.length;

        // -------- Resolve actor profiles --------
        const allActors = [
          ...reactors.map((r) => r.actor_urn),
          ...replies.map((r) => r.actor_urn).filter(Boolean) as string[],
        ];
        const profiles = await resolvePersons(allActors, token);

        // -------- Persist --------
        await supabase
          .from('engagement_comments')
          .update({
            reaction_count: totalReactions || reactors.length,
            reply_count: replyCount,
            reactions_breakdown: breakdown,
            engagement_fetched_at: new Date().toISOString(),
          })
          .eq('id', comment.id);

        if (reactors.length > 0) {
          const rows = reactors.map((r) => {
            const p = profiles[r.actor_urn] || { name: 'LinkedIn member', headline: null, profileUrl: null, avatarUrl: null };
            return {
              workspace_id,
              engagement_comment_id: comment.id,
              actor_urn: r.actor_urn,
              actor_name: p.name,
              actor_headline: p.headline,
              actor_profile_url: p.profileUrl,
              actor_avatar_url: p.avatarUrl,
              reaction_type: r.reaction_type,
              reacted_at: r.reacted_at ? new Date(r.reacted_at).toISOString() : null,
            };
          });
          await supabase.from('comment_reactors').upsert(rows, { onConflict: 'engagement_comment_id,actor_urn' });
        }

        if (replies.length > 0) {
          const rows = replies.map((r) => {
            const p = profiles[r.actor_urn] || { name: 'LinkedIn member', headline: null, profileUrl: null, avatarUrl: null };
            return {
              workspace_id,
              engagement_comment_id: comment.id,
              reply_urn: r.reply_urn,
              actor_urn: r.actor_urn || 'unknown',
              actor_name: p.name,
              actor_headline: p.headline,
              actor_profile_url: p.profileUrl,
              actor_avatar_url: p.avatarUrl,
              reply_text: r.reply_text,
              replied_at: r.replied_at ? new Date(r.replied_at).toISOString() : null,
            };
          });
          await supabase.from('comment_replies').upsert(rows, { onConflict: 'engagement_comment_id,reply_urn' });
        }

        updatedCount++;
      } catch (err) {
        console.error(`Error processing ${urn}:`, err);
        lastError = err instanceof Error ? err.message : String(err);
      }
    }

    const message = updatedCount > 0
      ? `Synced engagement for ${updatedCount} comment(s)`
      : `Could not fetch engagement. Last error: ${lastError || 'unknown'}`;

    return new Response(
      JSON.stringify({ success: true, updated_count: updatedCount, missing_urn_count: missingUrnCount, message }),
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
