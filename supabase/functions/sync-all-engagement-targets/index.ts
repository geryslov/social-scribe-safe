// =============================================================================
// sync-all-engagement-targets
//
// Daily cron job: iterate engagement_targets across workspaces where auto-sync
// is enabled and invoke fetch-target-posts for each. Records a summary row per
// workspace in engagement_sync_runs.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_HOURS = 18;
const BETWEEN_TARGETS_MS = 1500;
const BETWEEN_AUTOLIKE_MS = 2000;
// Stop processing new targets after this many ms and re-invoke self to continue.
// Edge functions cap around ~150s; leave headroom for the in-flight fetch + summary insert.
const TIME_BUDGET_MS = 110_000;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
    const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(SUPABASE_URL, SERVICE_KEY);

    // Optional: trigger a single workspace on demand
    let onlyWorkspaceId: string | null = null;
    let trigger = 'cron';
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        onlyWorkspaceId = body?.workspace_id ?? null;
        trigger = body?.trigger ?? (onlyWorkspaceId ? 'manual' : 'cron');
      } catch (_) { /* no body */ }
    }

    // Find workspaces with auto-sync enabled (default: enabled if no row)
    const { data: settings } = await supabase
      .from('workspace_engagement_settings')
      .select('workspace_id, auto_sync_enabled');
    const disabled = new Set(
      (settings || []).filter((s: any) => s.auto_sync_enabled === false).map((s: any) => s.workspace_id),
    );

    let targetsQuery = supabase
      .from('engagement_targets')
      .select('id, workspace_id, publisher_id, name, last_fetched_at, auto_like, auto_sync')
      .neq('auto_sync', false);
    if (onlyWorkspaceId) targetsQuery = targetsQuery.eq('workspace_id', onlyWorkspaceId);

    const { data: targets, error } = await targetsQuery;
    if (error) {
      console.error('Failed to load engagement_targets:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cutoff = Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000;
    const byWs = new Map<string, any[]>();
    for (const t of targets || []) {
      if (trigger === 'cron' && disabled.has(t.workspace_id)) continue;
      const arr = byWs.get(t.workspace_id) || [];
      arr.push(t);
      byWs.set(t.workspace_id, arr);
    }

    const startedAt = new Date().toISOString();
    const overall: any[] = [];

    const startedAtMs = new Date(startedAt).getTime();

    for (const [workspace_id, wsTargets] of byWs.entries()) {
      const results: any[] = [];
      let newPosts = 0;
      let cancelled = false;

      for (let i = 0; i < wsTargets.length; i++) {
        const t = wsTargets[i];

        // Check cancellation flag before each target
        const { data: settingsRow } = await supabase
          .from('workspace_engagement_settings')
          .select('sync_cancel_requested_at')
          .eq('workspace_id', workspace_id)
          .maybeSingle();
        const cancelAt = settingsRow?.sync_cancel_requested_at
          ? new Date(settingsRow.sync_cancel_requested_at).getTime()
          : 0;
        if (cancelAt >= startedAtMs) {
          cancelled = true;
          // Mark this and all remaining targets as cancelled
          for (let j = i; j < wsTargets.length; j++) {
            results.push({ target_id: wsTargets[j].id, name: wsTargets[j].name, status: 'cancelled', posts_found: 0 });
          }
          break;
        }

        if (trigger === 'cron' && t.last_fetched_at && new Date(t.last_fetched_at).getTime() > cutoff) {
          results.push({ target_id: t.id, name: t.name, status: 'skipped_cooldown', posts_found: 0 });
          continue;
        }
        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-target-posts`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ workspace_id: t.workspace_id, target_id: t.id }),
          });
          const body = await res.json().catch(() => ({}));
          const ok = res.ok && body.success;
          const found = Number(body?.posts_found || 0);
          if (ok) newPosts += found;
          results.push({
            target_id: t.id,
            name: t.name,
            status: ok ? 'synced' : 'failed',
            posts_found: found,
            detail: body?.error || body?.message || (ok ? undefined : `HTTP ${res.status}`),
          });
        } catch (err) {
          results.push({
            target_id: t.id,
            name: t.name,
            status: 'failed',
            posts_found: 0,
            detail: err instanceof Error ? err.message : String(err),
          });
        }

        // If auto_like is on for this target, run the server-side liker.
        // Only when the fetch succeeded (otherwise there's nothing new to like).
        const lastResult = results[results.length - 1];
        if (t.auto_like && lastResult?.status === 'synced') {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/auto-like-target-posts`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ workspace_id: t.workspace_id, target_id: t.id, trigger }),
            });
          } catch (err) {
            console.error('auto-like invoke failed for target', t.id, err);
          }
          await sleep(BETWEEN_AUTOLIKE_MS);
        }

        await sleep(BETWEEN_TARGETS_MS);
      }

      const summary = {
        total: wsTargets.length,
        synced: results.filter((r) => r.status === 'synced').length,
        skipped: results.filter((r) => r.status === 'skipped_cooldown').length,
        failed: results.filter((r) => r.status === 'failed').length,
        cancelled: results.filter((r) => r.status === 'cancelled').length,
        new_posts: newPosts,
      };

      await supabase.from('engagement_sync_runs').insert({
        workspace_id,
        started_at: startedAt,
        finished_at: new Date().toISOString(),
        total_targets: summary.total,
        synced: summary.synced,
        skipped: summary.skipped,
        failed: summary.failed,
        new_posts: summary.new_posts,
        trigger: cancelled ? `${trigger}_cancelled` : trigger,
        details: results,
      });

      // Clear the cancel flag if this run honored it
      if (cancelled) {
        await supabase
          .from('workspace_engagement_settings')
          .update({ sync_cancel_requested_at: null })
          .eq('workspace_id', workspace_id);
      }

      overall.push({ workspace_id, summary });
      console.log('sync workspace done:', workspace_id, summary);

      // After posts sync, refresh comment-engagement (reactions + replies on our comments)
      // for every publisher that has engagement targets in this workspace.
      try {
        const { data: pubRows } = await supabase
          .from('engagement_targets')
          .select('publisher_id')
          .eq('workspace_id', workspace_id);
        const publisherIds = Array.from(new Set((pubRows || []).map((r: any) => r.publisher_id).filter(Boolean)));
        for (const publisher_id of publisherIds) {
          try {
            await fetch(`${SUPABASE_URL}/functions/v1/fetch-comment-engagement`, {
              method: 'POST',
              headers: {
                'Authorization': `Bearer ${SERVICE_KEY}`,
                'Content-Type': 'application/json',
              },
              body: JSON.stringify({ workspace_id, publisher_id }),
            });
          } catch (err) {
            console.error('comment-engagement refresh failed for publisher', publisher_id, err);
          }
          await sleep(800);
        }
      } catch (err) {
        console.error('comment-engagement loop failed for workspace', workspace_id, err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, workspaces: overall }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('sync-all-engagement-targets error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
