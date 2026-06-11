// =============================================================================
// sync-all-engagement-targets
//
// Daily cron job: iterate all engagement_targets across all workspaces and
// invoke fetch-target-posts for each so new LinkedIn posts are pulled in
// automatically.
//
// Skips targets synced within the last 18 hours to avoid hammering Apify.
// Returns a summary of which targets were synced / skipped / failed.
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const COOLDOWN_HOURS = 18;
const BETWEEN_TARGETS_MS = 1500; // small spacing between Apify run starts

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

    const { data: targets, error } = await supabase
      .from('engagement_targets')
      .select('id, workspace_id, name, last_fetched_at');

    if (error) {
      console.error('Failed to load engagement_targets:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const cutoff = Date.now() - COOLDOWN_HOURS * 60 * 60 * 1000;
    const results: Array<{ target_id: string; name: string; status: string; detail?: string }> = [];

    for (const t of targets || []) {
      if (t.last_fetched_at && new Date(t.last_fetched_at).getTime() > cutoff) {
        results.push({ target_id: t.id, name: t.name, status: 'skipped_cooldown' });
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
        results.push({
          target_id: t.id,
          name: t.name,
          status: res.ok && body.success ? 'synced' : 'failed',
          detail: body.error || body.message || `HTTP ${res.status}`,
        });
      } catch (err) {
        results.push({
          target_id: t.id,
          name: t.name,
          status: 'failed',
          detail: err instanceof Error ? err.message : String(err),
        });
      }

      await sleep(BETWEEN_TARGETS_MS);
    }

    const summary = {
      total: targets?.length || 0,
      synced: results.filter((r) => r.status === 'synced').length,
      skipped: results.filter((r) => r.status === 'skipped_cooldown').length,
      failed: results.filter((r) => r.status === 'failed').length,
    };

    console.log('sync-all-engagement-targets done:', summary);

    return new Response(
      JSON.stringify({ success: true, summary, results }),
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
