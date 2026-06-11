// =============================================================================
// generate-voice-profile — Analyze a publisher's LinkedIn and create a
// reusable voice profile for content generation.
//
// Fallback chain: Firecrawl → Apify → DB-only
//
// Input:  { publisher_id }
// Output: { success, voice_profile }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Scrape LinkedIn via Firecrawl (same pattern as scrape-linkedin)
// ---------------------------------------------------------------------------
async function scrapeWithFirecrawl(linkedinUrl: string): Promise<string | null> {
  const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
  if (!apiKey) return null;

  try {
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: linkedinUrl,
        formats: ['markdown'],
        onlyMainContent: true,
      }),
    });

    if (!res.ok) {
      console.log('Firecrawl failed:', res.status);
      return null;
    }

    const data = await res.json();
    const markdown = data.data?.markdown || '';
    if (markdown.length > 100) {
      console.log(`Firecrawl: got ${markdown.length} chars of profile content`);
      return markdown.substring(0, 15000);
    }
    return null;
  } catch (err) {
    console.error('Firecrawl error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Scrape LinkedIn via Apify (profile scraper)
// ---------------------------------------------------------------------------
async function scrapeWithApify(
  linkedinUrl: string,
  apifyToken: string,
): Promise<string | null> {
  const APIFY_BASE = 'https://api.apify.com/v2';
  const ACTOR = 'harvestapi~linkedin-profile-scraper';

  try {
    // Start run
    const startRes = await fetch(`${APIFY_BASE}/acts/${ACTOR}/runs?token=${apifyToken}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: [linkedinUrl] }),
    });

    if (!startRes.ok) return null;
    const startData = await startRes.json();
    const runId = startData?.data?.id;
    if (!runId) return null;

    // Poll
    const startTime = Date.now();
    while (Date.now() - startTime < 40000) {
      const pollRes = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apifyToken}`);
      if (!pollRes.ok) return null;
      const pollData = await pollRes.json();
      const status = pollData?.data?.status;
      if (status === 'SUCCEEDED') {
        const dsId = pollData?.data?.defaultDatasetId;
        if (!dsId) return null;
        const dsRes = await fetch(`${APIFY_BASE}/datasets/${dsId}/items?token=${apifyToken}&format=json`);
        if (!dsRes.ok) return null;
        const items = await dsRes.json();
        if (Array.isArray(items) && items.length > 0) {
          return JSON.stringify(items[0], null, 2).substring(0, 15000);
        }
        return null;
      }
      if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') return null;
      await sleep(3000);
    }
    return null;
  } catch (err) {
    console.error('Apify profile scrape error:', err);
    return null;
  }
}

// ---------------------------------------------------------------------------
// Voice profile generation prompt
// ---------------------------------------------------------------------------
const VOICE_PROFILE_PROMPT = `You are an expert content strategist and ghostwriter specializing in LinkedIn thought leadership.

Your task: analyze the provided information about a person and create a detailed, reusable VOICE PROFILE that will be used to write LinkedIn posts and comments as this person.

The voice profile must be specific enough that a writer (human or AI) could read it and produce content that sounds authentically like this person — not generic professional content, but content with THEIR distinct voice, perspective, and style.

Create the profile using EXACTLY this structure:

## Professional Identity
- Current role and company
- Industry and domain expertise
- Career trajectory (where they came from, what shaped their perspective)
- What makes them credible on their topics

## Writing Voice
- Tone (e.g., analytical and direct, warm and conversational, provocative and challenging)
- Formality level (e.g., business casual, executive, casual-expert)
- Perspective (e.g., data-driven pragmatist, visionary futurist, contrarian challenger)
- Sentence style (e.g., short punchy statements, longer analytical builds, storytelling arcs)
- How they open posts (their typical hook patterns)

## Content Themes
- Primary topics they write about
- Recurring arguments or positions they take
- What they champion (their "mission")
- What they push back against

## Vocabulary & Phrasing
- Characteristic phrases or expressions they'd use
- Technical depth level (jargon comfort)
- Things to AVOID (words, phrases, or styles that would feel inauthentic for them)
- NEVER include these phrases in any voice profile: "changes everything", "game changer", "keeps me up at night", "let that sink in", "the real story here", "this is huge", "couldn't agree more". These are generic LinkedIn influencer phrases, not authentic voice markers.

## Perspective & Worldview
- What they believe that others don't
- Their contrarian takes
- How they see their industry evolving
- The change they want to drive

Keep the profile to 300-500 words. Be SPECIFIC — generic descriptions like "professional and engaging" are useless. Every line should help differentiate this person's voice from anyone else's.

If you don't have enough information to fill a section, make an informed inference based on their role, industry, and company — but flag it as inferred.`;

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { publisher_id } = await req.json();

    if (!publisher_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'publisher_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Load publisher ---
    const { data: pub, error: pubErr } = await supabase
      .from('publishers')
      .select('id, name, role, headline, company_name, linkedin_url, workspace_id')
      .eq('id', publisher_id)
      .single();

    if (pubErr || !pub) {
      return new Response(
        JSON.stringify({ success: false, error: 'Publisher not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Gather source material ---
    let linkedinContent: string | null = null;
    let existingPosts: string | null = null;

    // 1. Try Firecrawl for LinkedIn profile
    if (pub.linkedin_url) {
      let url = pub.linkedin_url.trim();
      if (!url.startsWith('http')) url = `https://${url}`;
      console.log('Scraping LinkedIn profile for voice analysis:', url);
      linkedinContent = await scrapeWithFirecrawl(url);
    }

    // 2. Fallback to Apify if Firecrawl failed
    if (!linkedinContent && pub.linkedin_url) {
      const { data: keyRow } = await supabase
        .from('workspace_api_keys')
        .select('api_key_encrypted')
        .eq('workspace_id', pub.workspace_id)
        .eq('service_name', 'apify')
        .eq('is_valid', true)
        .maybeSingle();

      if (keyRow?.api_key_encrypted) {
        let url = pub.linkedin_url.trim();
        if (!url.startsWith('http')) url = `https://${url}`;
        console.log('Trying Apify profile scraper as fallback');
        linkedinContent = await scrapeWithApify(url, keyRow.api_key_encrypted);
      }
    }

    // 3. Gather existing posts for style analysis
    const { data: posts } = await supabase
      .from('posts')
      .select('content')
      .eq('publisher_name', pub.name)
      .eq('workspace_id', pub.workspace_id)
      .order('created_at', { ascending: false })
      .limit(10);

    if (posts && posts.length > 0) {
      const samples = posts
        .filter((p: { content: string | null }) => p.content && p.content.length > 50)
        .slice(0, 5)
        .map((p: { content: string }, i: number) => `--- Post ${i + 1} ---\n${p.content.substring(0, 800)}`)
        .join('\n\n');
      if (samples.length > 100) {
        existingPosts = samples;
      }
    }

    // --- Build the Claude prompt ---
    let userMessage = `Analyze this person and create their voice profile:\n\n`;
    userMessage += `Name: ${pub.name}\n`;
    if (pub.role) userMessage += `Role: ${pub.role}\n`;
    if (pub.headline) userMessage += `Headline: ${pub.headline}\n`;
    if (pub.company_name) userMessage += `Company: ${pub.company_name}\n`;
    if (pub.linkedin_url) userMessage += `LinkedIn: ${pub.linkedin_url}\n`;

    if (linkedinContent) {
      userMessage += `\n--- LINKEDIN PROFILE CONTENT ---\n${linkedinContent}\n`;
    } else {
      userMessage += `\n(LinkedIn profile could not be scraped. Generate the profile based on the available information above. Flag inferred sections.)\n`;
    }

    if (existingPosts) {
      userMessage += `\n--- SAMPLE POSTS BY THIS PERSON ---\nAnalyze the writing style, tone, and patterns in these posts:\n\n${existingPosts}\n`;
    }

    // --- Call Claude ---
    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'ANTHROPIC_API_KEY not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log('Calling Claude to generate voice profile...');

    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 2048,
        system: VOICE_PROFILE_PROMPT,
        messages: [{ role: 'user', content: userMessage }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text();
      console.error('Claude API error:', claudeRes.status, errText);
      return new Response(
        JSON.stringify({ success: false, error: `AI error: ${claudeRes.status}` }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const claudeData = await claudeRes.json();
    const voiceProfile = claudeData.content?.[0]?.text || '';

    if (!voiceProfile || voiceProfile.length < 50) {
      return new Response(
        JSON.stringify({ success: false, error: 'Generated profile was empty or too short' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Save to publisher ---
    const { error: updateErr } = await supabase
      .from('publishers')
      .update({
        voice_profile: voiceProfile,
        voice_profile_generated_at: new Date().toISOString(),
      })
      .eq('id', publisher_id);

    if (updateErr) {
      console.error('Failed to save voice profile:', updateErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to save voice profile' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`Voice profile generated for ${pub.name} (${voiceProfile.length} chars)`);

    return new Response(
      JSON.stringify({ success: true, voice_profile: voiceProfile }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('generate-voice-profile error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to generate voice profile';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
