// =============================================================================
// classify-post — Read a post and label it (post_type, subject, notable_angle).
// Runs on composer open so the user sees categorization immediately.
//
// Cache: writes result to engagement_posts.post_metadata.classification
//        so subsequent opens read from DB instead of re-hitting Claude.
//
// Input:  { post_content, author_name?, engagement_post_id?, workspace_id? }
// Output: { success, classification: { post_type, subject, notable_angle } }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a post-labeling agent. Read one LinkedIn post and return a JSON label. No comment writing.

Determine:

- post_type: match one of these known types, or create a new one if none fit.
  announcement_funding: funding round or investment.
  announcement_launch: product launch, feature release, new tool.
  announcement_hire: new job, new role, joined a company.
  announcement_milestone: revenue milestone, anniversary, award, achievement.
  opinion_hot_take: contrarian view, industry argument, strong position.
  opinion_lesson: recap with analysis, lessons learned, reflection with a POV.
  data_insight: stats, research findings, benchmarks, data-driven observation.
  story_personal: personal story, vulnerability, career journey.
  educational: how-to, framework, tips, playbook, step-by-step advice.
  question: asking the audience something directly.
  promotion: hiring post, event, webinar, selling something.

- subject: the company, person, or product the post is about, by short name.

- notable_angle: the ONE most specific thing about THIS post a peer would react to. Not the generic bucket ("it's a funding announcement") — the specific angle ("Series B led by an unusual crypto-native fund" or "founder framed the launch around a customer story, not the feature"). If nothing is genuinely notable, say so plainly ("standard milestone post, nothing structurally unusual"). One short sentence.

Return ONLY a JSON object, no markdown fences:

{"post_type":"...","subject":"...","notable_angle":"..."}`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { post_content, author_name, engagement_post_id, workspace_id } = await req.json();

    if (!post_content) {
      return new Response(
        JSON.stringify({ success: false, error: 'post_content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const userMessage =
      `Post by ${author_name || 'someone'}:\n\n"""\n${post_content.slice(0, 2500)}\n"""\n\nLabel it. Return the JSON object only.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 200,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      console.error('Claude API error:', res.status, errText);
      return new Response(
        JSON.stringify({ success: false, error: `AI error: ${res.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const data = await res.json();
    const raw = (data.content?.[0]?.text || '').trim();

    let classification: { post_type?: string; subject?: string; notable_angle?: string } = {};
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        classification = {
          post_type: typeof parsed.post_type === 'string' ? parsed.post_type : undefined,
          subject: typeof parsed.subject === 'string' ? parsed.subject : undefined,
          notable_angle: typeof parsed.notable_angle === 'string' ? parsed.notable_angle : undefined,
        };
      } catch {
        // fall through
      }
    }

    if (!classification.post_type) {
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to parse classification' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Cache to engagement_posts.post_metadata.classification if the caller
    // gave us a post id + workspace id. Fire-and-forget: a save failure does
    // not fail the request.
    if (engagement_post_id && workspace_id) {
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
        );
        const { data: row } = await supabase
          .from('engagement_posts')
          .select('post_metadata')
          .eq('id', engagement_post_id)
          .eq('workspace_id', workspace_id)
          .single();
        const nextMetadata = {
          ...(row?.post_metadata || {}),
          classification: { ...classification, classified_at: new Date().toISOString() },
        };
        await supabase
          .from('engagement_posts')
          .update({ post_metadata: nextMetadata })
          .eq('id', engagement_post_id)
          .eq('workspace_id', workspace_id);
      } catch (cacheErr) {
        console.error('classify-post cache write failed:', cacheErr);
      }
    }

    return new Response(
      JSON.stringify({ success: true, classification }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('classify-post error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
