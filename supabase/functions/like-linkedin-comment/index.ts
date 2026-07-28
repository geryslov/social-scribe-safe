// =============================================================================
// like-linkedin-comment — Like a LinkedIn COMMENT on behalf of a publisher.
//
// Comments a target left on someone else's post live in
// `engagement_target_comments`. Each row carries a `comment_urn`
// (`urn:li:comment:(activity:...,...)` typically) that LinkedIn's Reactions
// API accepts as `root` — same endpoint used for post likes.
//
// Input : { workspace_id, publisher_id, comment_id }
// Output: { success, already_liked? } | { success: false, error }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { workspace_id, publisher_id, comment_id } = await req.json();
    if (!workspace_id || !publisher_id || !comment_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id, publisher_id, comment_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    const { data: publisher, error: pubErr } = await supabase
      .from('publishers')
      .select('id, linkedin_member_id')
      .eq('id', publisher_id).eq('workspace_id', workspace_id).single();
    if (pubErr || !publisher?.linkedin_member_id) {
      return new Response(JSON.stringify({ success: false, error: 'Publisher not found or not connected' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: tokenRow } = await supabase
      .from('publisher_tokens').select('linkedin_access_token').eq('publisher_id', publisher_id).single();
    if (!tokenRow?.linkedin_access_token) {
      return new Response(JSON.stringify({ success: false, error: 'Publisher has no LinkedIn token. Reconnect.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: commentRow, error: cErr } = await supabase
      .from('engagement_target_comments')
      .select('id, comment_urn, comment_url, parent_post_urn, parent_post_url, comment_metadata')
      .eq('id', comment_id).eq('workspace_id', workspace_id).single();
    if (cErr || !commentRow) {
      return new Response(JSON.stringify({ success: false, error: 'Comment not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const safeDecode = (value: string) => {
      try {
        return decodeURIComponent(value);
      } catch {
        return value;
      }
    };

    const pushLinkedInUrnsFromText = (text: string | null | undefined, out: string[]) => {
      if (!text) return;
      const decoded = safeDecode(text);
      const matches = decoded.match(/urn:li:(?:comment:\([^\s"')]+\)|activity:\d+|ugcPost:\d+|share:\d+)/g);
      if (matches) out.push(...matches);
    };

    const numericIdFrom = (value: string | null | undefined): string | null => {
      if (!value) return null;
      return value.match(/\b(\d{10,})\b/)?.[1] ?? null;
    };

    const parentCandidates: string[] = [];
    pushLinkedInUrnsFromText(commentRow.parent_post_urn, parentCandidates);
    pushLinkedInUrnsFromText(commentRow.parent_post_url, parentCandidates);
    const rawPost = ((commentRow.comment_metadata || {}) as Record<string, unknown>).raw as Record<string, unknown> | undefined;
    const rawPostData = (rawPost?.post || {}) as Record<string, unknown>;
    pushLinkedInUrnsFromText(typeof rawPostData.shareUrn === 'string' ? rawPostData.shareUrn : null, parentCandidates);
    pushLinkedInUrnsFromText(typeof rawPostData.entityId === 'string' ? rawPostData.entityId : null, parentCandidates);
    pushLinkedInUrnsFromText(typeof rawPostData.id === 'string' ? rawPostData.id : null, parentCandidates);
    const parentNumeric = numericIdFrom(commentRow.parent_post_urn) || numericIdFrom(commentRow.parent_post_url);
    if (parentNumeric) {
      parentCandidates.push(`urn:li:activity:${parentNumeric}`);
      parentCandidates.push(`urn:li:share:${parentNumeric}`);
      parentCandidates.push(`urn:li:ugcPost:${parentNumeric}`);
    }
    const validParentUrns = [...new Set(parentCandidates)].filter((urn) =>
      /^urn:li:(activity|share|ugcPost):\d+$/.test(urn),
    );

    // Assemble candidate URNs. Some Apify rows store only the numeric comment id;
    // LinkedIn's reactions endpoint needs the full urn:li:comment:(parentUrn,id).
    const candidates: string[] = [];
    pushLinkedInUrnsFromText(commentRow.comment_urn, candidates);
    pushLinkedInUrnsFromText(commentRow.comment_url, candidates);

    const storedCommentId = numericIdFrom(commentRow.comment_urn) || numericIdFrom(commentRow.comment_url);
    if (storedCommentId) {
      for (const parentUrn of validParentUrns) {
        candidates.push(`urn:li:comment:(${parentUrn},${storedCommentId})`);
      }
    }

    const tryUrns = [...new Set(candidates)].filter((urn) => /^urn:li:comment:\(urn:li:(activity|share|ugcPost):\d+,\d+\)$/.test(urn));
    if (tryUrns.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'No comment URN available to like' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const personUrn = `urn:li:person:${publisher.linkedin_member_id}`;
    const actorParam = encodeURIComponent(personUrn);

    let lastErr = '';
    let lastStatus = 0;

    const markLiked = async (urn: string, already = false) => {
      const meta = { ...(commentRow.comment_metadata || {}), is_liked: true, liked_at: new Date().toISOString(), liked_urn: urn };
      await supabase.from('engagement_target_comments').update({ comment_metadata: meta }).eq('id', comment_id);
      return new Response(JSON.stringify({ success: true, already_liked: already, urn }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    };

    for (const urn of tryUrns) {
      const res = await fetch(`https://api.linkedin.com/v2/reactions?actor=${actorParam}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenRow.linkedin_access_token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({ root: urn, reactionType: 'LIKE' }),
      });

      if (res.ok || res.status === 201 || res.status === 204) {
        return await markLiked(urn, false);
      }

      lastErr = await res.text();
      lastStatus = res.status;
      console.warn(`like-comment ${urn} -> ${res.status}: ${lastErr.slice(0, 200)}`);

      if (res.status === 409 || /already/i.test(lastErr) || /DUPLICATE/i.test(lastErr)) {
        return await markLiked(urn, true);
      }
      if (res.status === 401 || res.status === 403) break;
    }

    let friendly = `LinkedIn API ${lastStatus}: ${lastErr.slice(0, 300)}`;
    if (lastStatus === 403) friendly = 'LinkedIn denied the like (403). Publisher token missing w_member_social scope. Reconnect.';
    else if (lastStatus === 401) friendly = 'LinkedIn token expired. Reconnect the publisher.';

    return new Response(JSON.stringify({ success: false, error: friendly, linkedin_status: lastStatus }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('like-linkedin-comment error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to like comment';
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
