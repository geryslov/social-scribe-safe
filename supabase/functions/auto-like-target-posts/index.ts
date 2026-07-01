// =============================================================================
// auto-like-target-posts
//
// Server-side auto-like loop. For a single target with auto_like=true, iterates
// unliked engagement_posts and calls like-linkedin-post (auto:true) with a
// jittered spacing so it doesn't look bot-y. Stops on daily cap or auth error.
// Every attempt is logged into engagement_auto_like_runs so the Activity tab
// can show what happened, per day, per target.
//
// Input:  { workspace_id, target_id, trigger? }
// Output: { success, attempted, liked, skipped_already, cap_reached, failed }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const MIN_DELAY_MS = 6_000;
const MAX_DELAY_MS = 12_000;
const MAX_POSTS_PER_RUN = 10;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { workspace_id, target_id, trigger = 'cron' } = await req.json();
    if (!workspace_id || !target_id) {
      return new Response(JSON.stringify({ success: false, error: 'workspace_id + target_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    const { data: target } = await supabase
      .from('engagement_targets')
      .select('id, name, publisher_id, workspace_id, auto_like')
      .eq('id', target_id).eq('workspace_id', workspace_id).maybeSingle();

    if (!target) {
      return new Response(JSON.stringify({ success: false, error: 'target not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (!target.auto_like) {
      return new Response(JSON.stringify({ success: true, skipped: 'auto_like_off' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { data: posts } = await supabase
      .from('engagement_posts')
      .select('id, linkedin_post_url, content, is_liked, published_at')
      .eq('target_id', target_id)
      .eq('is_liked', false)
      .order('published_at', { ascending: false })
      .limit(MAX_POSTS_PER_RUN);

    const queue = (posts || []) as Array<{ id: string; linkedin_post_url: string; content: string | null }>;
    let attempted = 0, liked = 0, skipped_already = 0, failed = 0;
    let capReached = false;

    for (let i = 0; i < queue.length; i++) {
      if (capReached) break;
      const p = queue[i];
      attempted++;

      let statusLabel = 'failed';
      let errorMsg: string | null = null;

      try {
        const res = await fetch(`${SUPABASE_URL}/functions/v1/like-linkedin-post`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            workspace_id, publisher_id: target.publisher_id, post_id: p.id, auto: true,
          }),
        });
        const body = await res.json().catch(() => ({}));
        if (body?.cap_reached) {
          capReached = true;
        } else if (body?.success) {
          if (body?.already_liked) skipped_already++; else liked++;
        } else {
          failed++;
        }
      } catch (err) {
        failed++;
        console.error('like invoke failed:', err);
      }

      if (i < queue.length - 1 && !capReached) {
        await sleep(jitter());
      }
    }

    return new Response(JSON.stringify({
      success: true, attempted, liked, skipped_already, cap_reached: capReached, failed,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (e) {
    console.error('auto-like-target-posts error:', e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
