// =============================================================================
// sync-all-engagement-targets
//
// Cron/manual entry point. Groups eligible engagement_targets per workspace and
// invokes fetch-target-posts-batch (one Apify run per BATCH_SIZE targets)
// instead of firing one Apify run per target.
//
// A time budget guards the edge-function timeout; when hit, we re-invoke self
// with `trigger: cron_continue` (or `manual_continue`) so remaining workspaces
// pick up on the next hop.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Daily cadence. fetch-target-posts-batch bills per post returned (harvestapi),
// and unchanged profiles return nothing → cost scales with new posts, not with
// how often we check. 20h keeps a target eligible on the next daily run.
const COOLDOWN_HOURS = 20;
const BETWEEN_BATCHES_MS = 500;
const BETWEEN_AUTOLIKE_MS = 2000;
const TIME_BUDGET_MS = 110_000;
// Must match BATCH_SIZE in fetch-target-posts-batch — used only for chunking
// the target list at this layer for progress reporting / cancellation.
const BATCH_SIZE = 40;

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

    let onlyWorkspaceId: string | null = null;
    let trigger = 'cron';
    if (req.method === 'POST') {
      try {
        const body = await req.json();
        onlyWorkspaceId = body?.workspace_id ?? null;
        trigger = body?.trigger ?? (onlyWorkspaceId ? 'manual' : 'cron');
      } catch (_) { /* no body */ }
    }

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
      if (trigger.startsWith('cron') && disabled.has(t.workspace_id)) continue;
      const arr = byWs.get(t.workspace_id) || [];
      arr.push(t);
      byWs.set(t.workspace_id, arr);
    }

    const startedAt = new Date().toISOString();
    const startedAtMs = new Date(startedAt).getTime();
    const overall: any[] = [];
    let budgetExceeded = false;

    for (const [workspace_id, wsTargets] of byWs.entries()) {
      // Split into eligible (past cooldown, or manual) and skipped
      const eligible: any[] = [];
      const results: any[] = [];
      for (const t of wsTargets) {
        if (trigger.startsWith('cron') && t.last_fetched_at && new Date(t.last_fetched_at).getTime() > cutoff) {
          results.push({ target_id: t.id, name: t.name, status: 'skipped_cooldown', posts_found: 0 });
        } else {
          eligible.push(t);
        }
      }

      let newPosts = 0;
      let cancelled = false;

      // Process eligible targets in batches
      const chunks: any[][] = [];
      for (let i = 0; i < eligible.length; i += BATCH_SIZE) {
        chunks.push(eligible.slice(i, i + BATCH_SIZE));
      }

      const autoLikeTargets: string[] = [];

      for (let ci = 0; ci < chunks.length; ci++) {
        if (Date.now() - startedAtMs > TIME_BUDGET_MS) {
          budgetExceeded = true;
          for (let j = ci; j < chunks.length; j++) {
            for (const t of chunks[j]) {
              results.push({ target_id: t.id, name: t.name, status: 'deferred', posts_found: 0 });
            }
          }
          break;
        }

        // Check cancellation flag before each batch
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
          for (let j = ci; j < chunks.length; j++) {
            for (const t of chunks[j]) {
              results.push({ target_id: t.id, name: t.name, status: 'cancelled', posts_found: 0 });
            }
          }
          break;
        }

        const chunk = chunks[ci];
        const target_ids = chunk.map((t) => t.id);

        try {
          const res = await fetch(`${SUPABASE_URL}/functions/v1/fetch-target-posts-batch`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ workspace_id, target_ids }),
          });
          const body = await res.json().catch(() => ({}));
          const batchDetails: any[] = body?.details || [];
          const byId = new Map<string, any>();
          for (const d of batchDetails) byId.set(d.target_id, d);

          for (const t of chunk) {
            const d = byId.get(t.id);
            if (d) {
              results.push(d);
              if (d.status === 'synced') {
                newPosts += Number(d.posts_found || 0);
                if (t.auto_like) autoLikeTargets.push(t.id);
              }
            } else {
              results.push({ target_id: t.id, name: t.name, status: 'failed', posts_found: 0, detail: body?.error || `HTTP ${res.status}` });
            }
          }
        } catch (err) {
          for (const t of chunk) {
            results.push({
              target_id: t.id,
              name: t.name,
              status: 'failed',
              posts_found: 0,
              detail: err instanceof Error ? err.message : String(err),
            });
          }
        }

        await sleep(BETWEEN_BATCHES_MS);
      }

      // Fire auto-like for successfully synced targets (fire-and-forget-ish per target)
      for (const target_id of autoLikeTargets) {
        try {
          await fetch(`${SUPABASE_URL}/functions/v1/auto-like-target-posts`, {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${SERVICE_KEY}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ workspace_id, target_id, trigger }),
          });
        } catch (err) {
          console.error('auto-like invoke failed for target', target_id, err);
        }
        await sleep(BETWEEN_AUTOLIKE_MS);
        if (Date.now() - startedAtMs > TIME_BUDGET_MS) { budgetExceeded = true; break; }
      }

      const summary = {
        total: wsTargets.length,
        synced: results.filter((r) => r.status === 'synced').length,
        skipped: results.filter((r) => r.status === 'skipped_cooldown').length,
        failed: results.filter((r) => r.status === 'failed').length,
        cancelled: results.filter((r) => r.status === 'cancelled').length,
        deferred: results.filter((r) => r.status === 'deferred').length,
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

      if (cancelled) {
        await supabase
          .from('workspace_engagement_settings')
          .update({ sync_cancel_requested_at: null })
          .eq('workspace_id', workspace_id);
      }

      overall.push({ workspace_id, summary });
      console.log('sync workspace done:', workspace_id, summary);

      // Refresh comment engagement per publisher
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
          await sleep(400);
          if (Date.now() - startedAtMs > TIME_BUDGET_MS) { budgetExceeded = true; break; }
        }
      } catch (err) {
        console.error('comment-engagement loop failed for workspace', workspace_id, err);
      }

      if (budgetExceeded) break;
    }

    let rechained = false;
    if (budgetExceeded) {
      try {
        const nextBody: Record<string, unknown> = { trigger: `${trigger}_continue` };
        if (onlyWorkspaceId) nextBody.workspace_id = onlyWorkspaceId;
        fetch(`${SUPABASE_URL}/functions/v1/sync-all-engagement-targets`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${SERVICE_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(nextBody),
        }).catch((err) => console.error('re-trigger failed:', err));
        rechained = true;
        console.log('sync-all-engagement-targets: time budget hit, re-triggered self');
      } catch (err) {
        console.error('failed to schedule re-trigger:', err);
      }
    }

    return new Response(
      JSON.stringify({ success: true, workspaces: overall, rechained }),
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
