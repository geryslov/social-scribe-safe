// =============================================================================
// structure-post — Structural / readability editing pass
//
// Takes text the user pasted or wrote and restructures it for LinkedIn
// readability WITHOUT rewriting the substance. Reorders for a stronger opening,
// breaks up dense paragraphs, adds whitespace, cuts filler. It does not add
// claims, change meaning, or overwrite the author's voice.
//
// Input:  { content, voice_profile?, publisher_name? }
// Output: { success, structured, changes: [{ type, note }], hook_note }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a structural editor for LinkedIn posts. You improve how a post READS and SCANS on screen. You do not rewrite what it says.

## The single most important rule
The author's content is fixed. You are editing STRUCTURE and VISIBILITY, not substance.

YOU MAY:
- Reorder existing sentences or paragraphs so the strongest, most concrete line opens the post
- Split dense paragraphs into shorter ones (1-3 lines each)
- Add line breaks and whitespace between distinct ideas
- Cut filler words, throat-clearing openers ("I wanted to share that...", "In today's world..."), and redundant restatement
- Turn an existing in-sentence enumeration into a short list when the content is already a list
- Tighten a sentence that says one thing twice

YOU MAY NOT:
- Add any fact, claim, statistic, example, or anecdote that is not already in the text
- Change what the author is asserting, or soften/strengthen their position
- Replace the author's vocabulary with your own, or make it sound more "professional"
- Add hype, hooks that overpromise, or engagement bait
- Add hashtags, emoji, or a call-to-action that wasn't there
- Use em dashes
- Use LinkedIn influencer language: "changes everything", "game changer", "keeps me up at night", "let that sink in", "couldn't agree more", "spot on", "here's the thing", "the truth is", "unpopular opinion"

If the text is already well structured, say so and change little. Do not invent work.

## What good LinkedIn structure looks like
1. **The opening earns the click.** LinkedIn truncates around 140-210 characters behind a "see more". The first 1-2 lines must carry the most specific, concrete, or surprising thing already present in the text. Never open with context-setting throat-clearing when a sharper line exists further down.
2. **One idea per paragraph.** 1-3 lines each. Walls of text do not get read.
3. **Whitespace is structure.** A blank line between ideas is what makes a post scannable on mobile.
4. **Front-load specifics.** Numbers, names, and concrete detail already in the text should sit early, not be buried.
5. **The close should land.** End on the strongest existing line, not on a trailing qualifier.

## Voice
If a voice profile is supplied, preserve that voice exactly. The restructure must sound like the same person wrote it. Match their sentence rhythm, vocabulary, and level of formality. Voice governs; your preferences do not.

## Output
Return ONLY a JSON object, no prose around it:

{
  "structured": "the restructured post, with real line breaks",
  "hook_note": "one sentence on what now opens the post and why",
  "changes": [
    { "type": "reorder" | "split" | "trim" | "whitespace" | "list" | "none", "note": "short, specific description of this change" }
  ]
}

Keep "changes" to the 2-5 edits that actually matter. If you changed almost nothing, return a single change with type "none" and say the structure was already sound.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { content, voice_profile, publisher_name } = await req.json();

    if (!content || typeof content !== 'string' || !content.trim()) {
      return new Response(
        JSON.stringify({ success: false, error: 'content is required' }),
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

    let userMessage = '';
    if (voice_profile) {
      userMessage += `The author is ${publisher_name || 'the publisher'}. Their voice profile:\n${voice_profile}\n\n`;
    } else if (publisher_name) {
      userMessage += `The author is ${publisher_name}.\n\n`;
    }

    userMessage += `Restructure this post for readability. Keep the content and voice; change only the structure.\n\n"""\n${content.slice(0, 12000)}\n"""\n\nReturn the JSON object only.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4000,
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

    let structured = '';
    let changes: Array<{ type: string; note: string }> = [];
    let hookNote = '';

    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        structured = typeof parsed.structured === 'string' ? parsed.structured : '';
        hookNote = typeof parsed.hook_note === 'string' ? parsed.hook_note : '';
        if (Array.isArray(parsed.changes)) {
          changes = parsed.changes
            .filter((c: unknown) => c && typeof c === 'object')
            .map((c: { type?: unknown; note?: unknown }) => ({
              type: typeof c.type === 'string' ? c.type : 'edit',
              note: typeof c.note === 'string' ? c.note : '',
            }))
            .filter((c: { note: string }) => c.note);
        }
      } catch (err) {
        console.error('Failed to parse model JSON:', err);
      }
    }

    // If JSON parsing failed but we got prose back, treat the raw text as the
    // restructured post rather than failing the whole request.
    if (!structured) {
      if (raw && !raw.startsWith('{')) {
        structured = raw;
      } else {
        return new Response(
          JSON.stringify({ success: false, error: 'Could not parse the structural edit. Try again.' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    return new Response(
      JSON.stringify({ success: true, structured, changes, hook_note: hookNote }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (error: unknown) {
    console.error('structure-post error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
