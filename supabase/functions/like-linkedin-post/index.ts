// =============================================================================
// like-linkedin-post — Like a LinkedIn post on behalf of a publisher
//
// Uses the publisher's OAuth access token + w_member_social scope.
//   POST /v2/reactions?actor={personUrn}
//   body: { root: <object urn>, reactionType: "LIKE" }
//
// Input:  { workspace_id, publisher_id, post_id, auto? }
// Output: { success, already_liked? } or { success: false, cap_reached: true, count, cap }
//
// Daily cap: auto-likes are refused once the publisher has accumulated
// AUTO_LIKE_DAILY_CAP successful likes since 00:00 UTC. Manual likes
// (auto=false) bypass the cap because a human button-press is not the
// bot-pattern we're defending against.
// =============================================================================

const AUTO_LIKE_DAILY_CAP = 30;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { workspace_id, publisher_id, post_id, auto = false } = await req.json();
    if (!workspace_id || !publisher_id || !post_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id, publisher_id, post_id required' }),
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
      .select('id, name, linkedin_member_id')
      .eq('id', publisher_id).eq('workspace_id', workspace_id).single();
    if (pubErr || !publisher) {
      return new Response(JSON.stringify({ success: false, error: 'Publisher not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Fetch post + owning target now so we can log the auto-like attempt
    const { data: postRow } = await supabase
      .from('engagement_posts')
      .select('id, target_id, linkedin_post_url, content')
      .eq('id', post_id).eq('workspace_id', workspace_id).maybeSingle();
    const { data: targetRow } = postRow?.target_id
      ? await supabase.from('engagement_targets').select('id, name').eq('id', postRow.target_id).maybeSingle()
      : { data: null as any };

    const logAutoLike = async (status: string, errorMessage: string | null) => {
      if (!auto) return;
      try {
        await supabase.from('engagement_auto_like_runs').insert({
          workspace_id,
          publisher_id,
          target_id: postRow?.target_id ?? null,
          target_name: targetRow?.name ?? null,
          post_id: postRow?.id ?? null,
          post_url: postRow?.linkedin_post_url ?? null,
          post_excerpt: (postRow?.content || '').slice(0, 200),
          status,
          error_message: errorMessage,
          trigger: 'auto',
        });
      } catch (e) {
        console.warn('auto-like log failed:', e);
      }
    };


    // Daily-cap check (auto-likes only). Refuse before touching LinkedIn API.
    if (auto) {
      const todayStart = new Date();
      todayStart.setUTCHours(0, 0, 0, 0);

      const { data: targets } = await supabase
        .from('engagement_targets')
        .select('id')
        .eq('publisher_id', publisher_id);
      const targetIds = (targets || []).map((t: { id: string }) => t.id);

      if (targetIds.length > 0) {
        const { count: likedToday } = await supabase
          .from('engagement_posts')
          .select('id', { count: 'exact', head: true })
          .in('target_id', targetIds)
          .eq('is_liked', true)
          .gte('liked_at', todayStart.toISOString());

        if ((likedToday || 0) >= AUTO_LIKE_DAILY_CAP) {
          await logAutoLike('skipped_cap', `daily cap reached (${likedToday}/${AUTO_LIKE_DAILY_CAP})`);
          return new Response(JSON.stringify({
            success: false,
            cap_reached: true,
            count: likedToday || 0,
            cap: AUTO_LIKE_DAILY_CAP,
            error: `Auto-like daily cap reached (${likedToday}/${AUTO_LIKE_DAILY_CAP})`,
          }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
      }
    }

    const { data: tokenRow } = await supabase
      .from('publisher_tokens').select('linkedin_access_token').eq('publisher_id', publisher_id).single();
    if (!tokenRow?.linkedin_access_token) {
      return new Response(JSON.stringify({ success: false, error: 'Publisher has no LinkedIn token. Reconnect.' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: engPost, error: postErr } = await supabase
      .from('engagement_posts')
      .select('linkedin_post_urn, linkedin_post_url')
      .eq('id', post_id).eq('workspace_id', workspace_id).single();
    if (postErr || !engPost) {
      return new Response(JSON.stringify({ success: false, error: 'Post not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    let activityUrn: string | null = engPost.linkedin_post_urn;
    if (!activityUrn && engPost.linkedin_post_url) {
      const m = engPost.linkedin_post_url.match(/(urn:li:(?:activity|ugcPost|share):\d+)/);
      if (m) activityUrn = m[1];
      const m2 = engPost.linkedin_post_url.match(/\/feed\/update\/(urn%3Ali%3A(?:activity|ugcPost|share)%3A\d+)/);
      if (m2) activityUrn = decodeURIComponent(m2[1]);
    }

    const numericId = activityUrn ? (String(activityUrn).match(/(\d{10,})/)?.[1] ?? null) : null;
    const candidates: string[] = [];
    if (activityUrn && (activityUrn.startsWith('urn:li:ugcPost:') || activityUrn.startsWith('urn:li:share:') || activityUrn.startsWith('urn:li:activity:'))) {
      candidates.push(activityUrn);
    }
    if (numericId) {
      candidates.push(`urn:li:activity:${numericId}`);
      candidates.push(`urn:li:ugcPost:${numericId}`);
      candidates.push(`urn:li:share:${numericId}`);
    }
    const tryUrns = [...new Set(candidates)];
    if (tryUrns.length === 0) {
      return new Response(JSON.stringify({ success: false, error: 'Could not determine LinkedIn post URN' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const personUrn = `urn:li:person:${publisher.linkedin_member_id}`;
    const actorParam = encodeURIComponent(personUrn);

    let lastErr = '';
    let lastStatus = 0;

    const attemptLike = async (urn: string) => {
      return await fetch(`https://api.linkedin.com/v2/reactions?actor=${actorParam}`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokenRow.linkedin_access_token}`,
          'Content-Type': 'application/json',
          'X-Restli-Protocol-Version': '2.0.0',
        },
        body: JSON.stringify({ root: urn, reactionType: 'LIKE' }),
      });
    };

    const tried = new Set<string>();
    const queue = [...tryUrns];

    while (queue.length > 0) {
      const urn = queue.shift()!;
      if (tried.has(urn)) continue;
      tried.add(urn);

      const res = await attemptLike(urn);

      if (res.ok || res.status === 201 || res.status === 204) {
        await supabase.from('engagement_posts').update({
          is_liked: true, liked_at: new Date().toISOString(),
        }).eq('id', post_id);
        await logAutoLike('liked', null);
        return new Response(JSON.stringify({ success: true, urn }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      lastErr = await res.text();
      lastStatus = res.status;
      console.warn(`Like attempt ${urn} -> ${res.status}: ${lastErr.slice(0, 200)}`);

      // 409 / duplicate => already liked
      if (res.status === 409 || /already/i.test(lastErr) || /DUPLICATE/i.test(lastErr)) {
        await supabase.from('engagement_posts').update({
          is_liked: true, liked_at: new Date().toISOString(),
        }).eq('id', post_id);
        await logAutoLike('skipped_already', null);
        return new Response(JSON.stringify({ success: true, already_liked: true }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }

      // LinkedIn reveals the real thread URN in some 400 errors — extract and retry
      const actualMatch = lastErr.match(/actual threadUrn:\s*(urn:li:(?:activity|ugcPost|share):\d+)/i);
      if (actualMatch && !tried.has(actualMatch[1])) {
        queue.unshift(actualMatch[1]);
        continue;
      }

      // Stop on auth errors
      if (res.status === 401 || res.status === 403) break;
    }

    let friendly = `LinkedIn API ${lastStatus}: ${lastErr.slice(0, 300)}`;
    if (lastStatus === 403) friendly = 'LinkedIn denied the like (403). Publisher token missing w_member_social scope. Reconnect.';
    else if (lastStatus === 401) friendly = 'LinkedIn token expired. Reconnect the publisher.';

    await logAutoLike('failed', friendly);
    return new Response(JSON.stringify({ success: false, error: friendly, linkedin_status: lastStatus }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('like-linkedin-post error:', e);
    const msg = e instanceof Error ? e.message : 'Failed to like post';
    return new Response(JSON.stringify({ success: false, error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
