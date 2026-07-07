// =============================================================================
// bulk-enrich-targets — Server-side orchestration of enrichment + post fetch
//
// Kicks off enrich-engagement-target + fetch-target-posts for many targets
// without depending on the browser tab staying open. Uses EdgeRuntime.waitUntil
// so the response returns immediately while processing continues in background.
//
// Input:
//   { workspace_id: string,
//     target_ids?: string[],              // explicit list
//     publisher_id?: string,              // OR process all pending for publisher
//     concurrency?: number }              // default 4
// Output: { success, queued }
// =============================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

async function invokeFn(name: string, body: unknown): Promise<void> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/${name}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SERVICE_ROLE_KEY}`,
        'apikey': SERVICE_ROLE_KEY,
      },
      body: JSON.stringify(body),
    });
    // Consume body to avoid leaks.
    await res.text().catch(() => '');
  } catch (err) {
    console.error(`[bulk-enrich-targets] ${name} failed:`, err);
  }
}

async function processTargets(workspace_id: string, ids: string[], concurrency: number) {
  let cursor = 0;
  const workers = Array.from({ length: Math.min(concurrency, ids.length) }, async () => {
    while (cursor < ids.length) {
      const id = ids[cursor++];
      await invokeFn('enrich-engagement-target', { target_id: id });
      await invokeFn('fetch-target-posts', { workspace_id, target_id: id });
    }
  });
  await Promise.all(workers);
  console.log(`[bulk-enrich-targets] Completed ${ids.length} targets for workspace ${workspace_id}`);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const body = await req.json().catch(() => ({}));
    const workspace_id: string | undefined = body.workspace_id;
    const target_ids: string[] | undefined = body.target_ids;
    const publisher_id: string | undefined = body.publisher_id;
    const concurrency: number = Math.min(Math.max(Number(body.concurrency) || 4, 1), 8);

    if (!workspace_id) {
      return new Response(JSON.stringify({ error: 'workspace_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

    let ids: string[] = [];
    if (target_ids?.length) {
      ids = target_ids;
    } else if (publisher_id) {
      const { data, error } = await supabase
        .from('engagement_targets')
        .select('id')
        .eq('workspace_id', workspace_id)
        .eq('publisher_id', publisher_id)
        .neq('enrichment_status', 'succeeded')
        .limit(1000);
      if (error) throw error;
      ids = (data ?? []).map((r: { id: string }) => r.id);
    } else {
      return new Response(JSON.stringify({ error: 'target_ids or publisher_id required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (ids.length === 0) {
      return new Response(JSON.stringify({ success: true, queued: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fire-and-forget background processing.
    // @ts-ignore EdgeRuntime is available in Supabase Edge runtime
    EdgeRuntime.waitUntil(processTargets(workspace_id, ids, concurrency));

    return new Response(JSON.stringify({ success: true, queued: ids.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    console.error('[bulk-enrich-targets] error:', err);
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
