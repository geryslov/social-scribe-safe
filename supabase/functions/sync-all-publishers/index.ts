import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: publishers, error } = await supabase
      .from('publishers')
      .select('id, name')
      .eq('linkedin_connected', true);

    if (error) throw error;

    const results: { id: string; name: string; ok: boolean; error?: string }[] = [];

    for (const p of publishers || []) {
      try {
        const { error: invokeErr } = await supabase.functions.invoke('fetch-linkedin-posts', {
          body: { publisherId: p.id },
        });
        if (invokeErr) throw invokeErr;
        results.push({ id: p.id, name: p.name, ok: true });
      } catch (e: unknown) {
        const msg = e instanceof Error ? e.message : String(e);
        console.error(`Sync failed for ${p.name}:`, msg);
        results.push({ id: p.id, name: p.name, ok: false, error: msg });
      }
    }

    return new Response(
      JSON.stringify({ success: true, total: results.length, results }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('sync-all-publishers error:', e);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
