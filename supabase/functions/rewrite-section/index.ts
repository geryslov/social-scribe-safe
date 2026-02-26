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
      professional: 'Use a polished, professional tone. Formal but approachable.',
      casual: 'Use a relaxed, conversational tone. Write like talking to a friend.',
      bold: 'Use a bold, provocative tone. Be direct, challenge assumptions.',
      storytelling: 'Use a narrative, storytelling tone. Start with a personal anecdote or vivid scenario.',
      data_driven: 'Use a data-driven, analytical tone. Lead with numbers, stats, and evidence.',
      inspirational: 'Use an inspirational, motivational tone. Uplift and empower the reader.',
      humorous: 'Use a witty, humorous tone. Be clever and entertaining while delivering value.',
      contrarian: 'Use a contrarian tone. Challenge conventional wisdom and popular opinions.',
    };

    const lengthInstructions: Record<string, string> = {
      short: 'Keep it concise: 80-120 words. Punchy and to the point.',
      medium: 'Medium length: 150-250 words. Balanced detail and readability.',
      long: 'Longer form: 300-450 words. Detailed, thorough, with depth.',
    };

    const toneInstruction = toneInstructions[tone] || toneInstructions.professional;
    const lengthInstruction = lengthInstructions[length] || lengthInstructions.medium;

    const systemPrompt = `You are a LinkedIn content rewriter. Rewrite the given post with the specified tone and length.

${toneInstruction}
${lengthInstruction}

Rules:
- Keep the core message and key insights intact
- Use proper Unicode characters (never ASCII like '-->')
- Include empty lines between paragraphs for mobile readability
- Do NOT use bold or italic markdown formatting
- Add relevant emojis sparingly
- End with a call-to-action or thought-provoking question when suitable
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
