// =============================================================================
// run-auto-likes
//
// Dedicated auto-like scheduler. Previously auto-like ran at the tail of
// sync-all-engagement-targets and got starved by the fetch time budget.
// This function has its own budget: it walks every auto_like target that has
// not used its daily quota (1 post + 1 comment per target per day) and invokes
// auto-like-target-posts for each, with jittered spacing.
//
// Input:  { workspace_id?, publisher_id?, trigger? }
// Output: { success, processed, quota_done, rechained }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const TIME_BUDGET_MS = 110_000;
const MIN_DELAY_MS = 4_000;
const MAX_DELAY_MS = 9_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = () => MIN_DELAY_MS + Math.floor(Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const startedAtMs = Date.now();

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    let onlyWorkspaceId: string | null = null;
    let onlyPublisherId: string | null = null;
    let trigger = 'cron';
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        onlyWorkspaceId = body?.workspace_id ?? null;
        onlyPublisherId = body?.publisher_id ?? null;
        trigger = body?.trigger ?? (onlyWorkspaceId ? 'manual' : 'cron');
      } catch (_) { /* no body */ }
    }

    let q = supabase
      .from('engagement_targets')
      .select('id, workspace_id, publisher_id, name')
      .eq('auto_like', true);
    if (onlyWorkspaceId) q = q.eq('workspace_id', onlyWorkspaceId);
    if (onlyPublisherId) q = q.eq('publisher_id', onlyPublisherId);

    const { data: targets, error } = await q;
    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Skip targets that already used both halves of today's quota.
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { data: runs } = await supabase
      .from('engagement_auto_like_runs')
      .select('target_id, post_id')
      .in('status', ['liked', 'skipped_already'])
      .gte('run_at', dayStart.toISOString());

    const postDone = new Set<string>();
    const commentDone = new Set<string>();
    for (const r of (runs || []) as Array<{ target_id: string | null; post_id: string | null }>) {
      if (!r.target_id) continue;
      if (r.post_id) postDone.add(r.target_id); else commentDone.add(r.target_id);
    }

    const pending = (targets || []).filter(
      (t: any) => !(postDone.has(t.id) && commentDone.has(t.id)),
    );

    let processed = 0;
    let budgetExceeded = false;

    for (const t of pending) {
      if (Date.now() - startedAtMs > TIME_BUDGET_MS) { budgetExceeded = true; break; }
      try {
        await fetch(`${SUPABASE_URL}/functions/v1/auto-like-target-posts`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ workspace_id: t.workspace_id, target_id: t.id, trigger }),
        });
        processed++;
      } catch (err) {
        console.error('auto-like invoke failed for target', t.id, err);
      }
      await sleep(jitter());
    }

    let rechained = false;
    if (budgetExceeded && processed < pending.length) {
      try {
        const nextBody: Record<string, unknown> = { trigger: `${trigger}_continue` };
        if (onlyWorkspaceId) nextBody.workspace_id = onlyWorkspaceId;
        if (onlyPublisherId) nextBody.publisher_id = onlyPublisherId;
        fetch(`${SUPABASE_URL}/functions/v1/run-auto-likes`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nextBody),
        }).catch((err) => console.error('re-trigger failed:', err));
        rechained = true;
      } catch (err) {
        console.error('failed to schedule re-trigger:', err);
      }
    }

    return new Response(JSON.stringify({
      success: true,
      eligible: (targets || []).length,
      pending: pending.length,
      processed,
      quota_done: (targets || []).length - pending.length,
      rechained,
    }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('run-auto-likes error:', e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
