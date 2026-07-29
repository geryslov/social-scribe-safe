// =============================================================================
// retry-failed-enrichments — scheduled retry of enrichment_status='failed' rows
//
// Finds engagement_targets stuck at enrichment_status='failed' with no avatar,
// groups them by workspace, and re-invokes bulk-enrich-targets for each group.
// A 2h cooldown on enriched_at prevents hammering the same failing profile.
//
// Trigger: pg_cron (hourly) or manual POST.
// Optional body: { workspace_id?: string, force?: boolean, limit_per_workspace?: number }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const only_workspace: string | undefined = body.workspace_id;
    const force: boolean = !!body.force;
    const limit_per_workspace: number = Math.min(Math.max(Number(body.limit_per_workspace) || 100, 1), 500);

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    // Cooldown: don't retry rows enriched in the last 2 hours (unless force).
    const cooldownIso = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    let query = supabase
      .from('engagement_targets')
      .select('id, workspace_id, enriched_at')
      .eq('enrichment_status', 'failed')
      .is('avatar_url', null);

    if (only_workspace) query = query.eq('workspace_id', only_workspace);
    if (!force) query = query.or(`enriched_at.is.null,enriched_at.lt.${cooldownIso}`);

    const { data: rows, error } = await query.limit(5000);
    if (error) throw error;

    // Group by workspace
    const byWorkspace = new Map<string, string[]>();
    for (const r of (rows ?? []) as Array<{ id: string; workspace_id: string }>) {
      if (!byWorkspace.has(r.workspace_id)) byWorkspace.set(r.workspace_id, []);
      const arr = byWorkspace.get(r.workspace_id)!;
      if (arr.length < limit_per_workspace) arr.push(r.id);
    }

    const summary: Array<{ workspace_id: string; queued: number; ok: boolean; error?: string }> = [];

    for (const [workspace_id, target_ids] of byWorkspace.entries()) {
      // Skip workspace if no valid Apify key configured (bulk-enrich would 400).
      const { data: keyRow } = await supabase
        .from('workspace_api_keys')
        .select('id')
        .eq('workspace_id', workspace_id)
        .eq('service_name', 'apify')
        .eq('is_valid', true)
        .maybeSingle();
      if (!keyRow) {
        summary.push({ workspace_id, queued: 0, ok: false, error: 'no valid apify key' });
        continue;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/bulk-enrich-targets`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        },
        body: JSON.stringify({ workspace_id, target_ids }),
      });
      const ok = res.ok;
      const errText = ok ? undefined : await res.text().catch(() => '');
      summary.push({ workspace_id, queued: target_ids.length, ok, error: errText });
      if (!ok) console.error('[retry-failed-enrichments] invoke failed', workspace_id, res.status, errText);
    }

    return new Response(
      JSON.stringify({
        success: true,
        workspaces: byWorkspace.size,
        total_queued: summary.reduce((n, s) => n + s.queued, 0),
        summary,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('[retry-failed-enrichments] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
