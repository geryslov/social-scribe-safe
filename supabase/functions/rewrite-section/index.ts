const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, tone, length, workspaceSystemPrompt } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ success: false, error: 'Content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const toneInstructions: Record<string, string> = {
      professional: 'Tone: Polished and professional. Formal but approachable. Authoritative without being stiff.',
      casual: 'Tone: Relaxed and conversational. Write like talking to a smart friend over coffee.',
      bold: 'Tone: Bold and provocative. Be direct, challenge assumptions, take a strong stance.',
      storytelling: 'Tone: Narrative and immersive. Open with a vivid personal anecdote or scenario that pulls the reader in.',
      data_driven: 'Tone: Analytical and evidence-based. Lead with numbers, stats, and concrete proof points.',
      inspirational: 'Tone: Uplifting and motivational. Empower the reader, spark ambition.',
      humorous: 'Tone: Witty and clever. Be entertaining while delivering real value.',
      contrarian: 'Tone: Contrarian and thought-provoking. Challenge conventional wisdom and popular opinions head-on.',
    };

    const lengthInstructions: Record<string, string> = {
      short: 'Length: 80-120 words. Punchy and to the point.',
      medium: 'Length: 150-250 words. Balanced detail and readability.',
      long: 'Length: 300-450 words. Detailed, thorough, with depth.',
    };

    const toneInstruction = toneInstructions[tone] || toneInstructions.professional;
    const lengthInstruction = lengthInstructions[length] || lengthInstructions.medium;

    const systemPrompt = `You are a LinkedIn content rewriter following the ThoughtOS Content Framework.

${toneInstruction}
${lengthInstruction}

## Writing Structure (always follow):
1. Hook-driven opening — the first line MUST stop the scroll. Use a bold claim, surprising stat, or provocative question.
2. Micro-paragraphs only — max 3 sentences per paragraph. One idea per block.
3. Empty line between EVERY paragraph for mobile readability.
4. Randomize list symbols across posts — pick from: -  //  →  (never use * or •)
5. Use proper Unicode characters (never ASCII like '-->')
6. Do NOT use bold or italic markdown formatting (no ** or *)
7. Add relevant emojis sparingly — max 3-4 per post, never at the start of every line.
8. End with a thought-provoking question or clear call-to-action.

## Rules:
- Keep the core message and key insights intact
- Never improvise data — if the original has stats, keep them accurate
- Writing must feel natural and human, not AI-generated
- Return ONLY the rewritten post text, nothing else

${workspaceSystemPrompt ? `\nAdditional workspace guidelines:\n${workspaceSystemPrompt}` : ''}`;

    console.log(`Rewriting section with tone=${tone}, length=${length}`);

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: `Rewrite this LinkedIn post:\n\n${content}` },
        ],
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI credits exhausted' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to rewrite post' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const rewrittenContent = data.choices?.[0]?.message?.content?.trim();

    if (!rewrittenContent) {
      return new Response(
        JSON.stringify({ success: false, error: 'No content generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Section rewritten successfully');

    return new Response(
      JSON.stringify({ success: true, content: rewrittenContent }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error rewriting section:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to rewrite' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
