// =============================================================================
// sync-target-comments
//
// Dedicated cron entry point for fetching targets' OUTBOUND comments (comments
// they left on other people's posts). Previously this ran as a tail step inside
// sync-all-engagement-targets, where the post-fetch work ate the whole time
// budget and comments were almost never fetched.
//
// Picks targets with auto_sync on whose last_comments_fetched_at is older than
// COOLDOWN_HOURS, chunks them, and calls fetch-target-comments-batch. Own 110s
// budget with self-continuation.
//
// Input:  { workspace_id?, publisher_id?, trigger? }
// Output: { success, processed, new_comments, rechained }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_HOURS = 20;
const BATCH_SIZE = 40;
const TIME_BUDGET_MS = 110_000;

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
        trigger = body?.trigger ?? (onlyWorkspaceId || onlyPublisherId ? 'manual' : 'cron');
      } catch (_) { /* no body */ }
    }

    let q = supabase
      .from('engagement_targets')
      .select('id, workspace_id, last_comments_fetched_at')
      .neq('auto_sync', false);
    if (onlyWorkspaceId) q = q.eq('workspace_id', onlyWorkspaceId);
    if (onlyPublisherId) q = q.eq('publisher_id', onlyPublisherId);

    const { data: targets, error } = await q;
    if (error) {
      return new Response(JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const cutoff = Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000;
    const eligible = (targets || []).filter((t: any) =>
      !t.last_comments_fetched_at || new Date(t.last_comments_fetched_at).getTime() < cutoff);

    // Group by workspace (fetch-target-comments-batch is workspace-scoped)
    const byWs = new Map<string, string[]>();
    for (const t of eligible) {
      const arr = byWs.get(t.workspace_id) || [];
      arr.push(t.id);
      byWs.set(t.workspace_id, arr);
    }

    let processed = 0;
    let newComments = 0;
    let budgetExceeded = false;

    outer:
    for (const [workspace_id, ids] of byWs.entries()) {
      for (let i = 0; i < ids.length; i += BATCH_SIZE) {
        if (Date.now() - startedAtMs > TIME_BUDGET_MS) { budgetExceeded = true; break outer; }
        const target_ids = ids.slice(i, i + BATCH_SIZE);
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-target-comments-batch`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ workspace_id, target_ids }),
          });
          const body = await res.json().catch(() => ({}));
          newComments += Number(body?.new_comments || 0);
          processed += Number(body?.synced || 0);
        } catch (err) {
          console.error('fetch-target-comments-batch failed:', err);
        }
      }
    }

    let rechained = false;
    if (budgetExceeded) {
      const nextBody: Record<string, unknown> = { trigger: `${trigger}_continue` };
      if (onlyWorkspaceId) nextBody.workspace_id = onlyWorkspaceId;
      if (onlyPublisherId) nextBody.publisher_id = onlyPublisherId;
      fetch(`${SUPABASE_URL}/functions/v1/sync-target-comments`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${SERVICE_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(nextBody),
      }).catch((err) => console.error('re-trigger failed:', err));
      rechained = true;
    }

    return new Response(JSON.stringify({ success: true, processed, new_comments: newComments, rechained }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e) {
    console.error('sync-target-comments error:', e);
    return new Response(JSON.stringify({ success: false, error: e instanceof Error ? e.message : 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
