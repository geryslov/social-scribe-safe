// =============================================================================
// generate-comment — Dedicated comment generation (NOT routed through
// create-document, which has a post-generation system prompt that makes
// comments sound like mini-articles).
//
// Input:  { post_content, author_name, publisher_name, voice_profile?, comment_style? }
// Output: { success, comment }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You generate LinkedIn comments on behalf of a specific person.

You are NOT a content creator. You are NOT writing posts. You are writing a COMMENT — a short, casual reply that a real person would type on LinkedIn.

YOUR PROCESS:
1. First, deeply understand the post you're replying to:
   - What TYPE of post is this? (announcement, opinion, story, data insight, question, celebration, hiring, product launch, funding news, personal milestone, industry take)
   - What is the CORE MESSAGE? (the one thing the author wants people to take away)
   - What SPECIFIC DETAILS support it? (numbers, names, examples, timelines)
   - What is the EMOTIONAL TONE? (excited, reflective, provocative, grateful, urgent)

2. Then write a comment that MATCHES the post type:
   - Funding/announcement → congratulate with a specific detail ("the AI-native data governance angle is smart timing given where the market is")
   - Opinion/hot take → engage with the argument itself, agree/disagree with nuance
   - Data/insight → react to a specific number or finding
   - Personal story → connect with a related brief experience
   - Product launch → ask a sharp question or note what caught your attention
   - Hiring → signal boost briefly or mention why the team/mission stands out

3. CRITICAL: Your comment must prove you READ and UNDERSTOOD the post:
   - Name something specific from the post (a company name, a stat, a phrase, a person mentioned)
   - React to the ACTUAL point, not the general topic
   - If they announced funding, don't write about "data management" generically — reference THEIR specific angle

OUTPUT RULES:
- 1-2 sentences max. One sentence is ideal.
- Raw text only. No quotes, no "Comment:", no headers, no formatting.
- No "Great post!", "Love this!", "Congrats!", "This resonates" — these are bot tells.
  Exception: for genuine celebration posts (funding, milestones), a brief "congrats" is OK but MUST be followed by something specific.
- No em dashes. No bullet points.
- Casual, direct, typed-on-phone energy.
- Match the voice profile if provided — use their vocabulary and formality level.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { post_content, author_name, publisher_name, voice_profile, comment_style } = await req.json();

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

    // Build user message
    let userMessage = '';

    if (voice_profile) {
      userMessage += `You are ${publisher_name}. Your voice profile:\n${voice_profile}\n\n`;
    } else {
      userMessage += `You are ${publisher_name}.\n\n`;
    }

    if (comment_style) {
      userMessage += `APPROACH: ${comment_style}\n\n`;
    }

    userMessage += `Reply to this post by ${author_name || 'someone'}:\n\n"""\n${post_content.slice(0, 2000)}\n"""\n\nYour comment:`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 150, // Hard cap — comments should be tiny
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
    let comment = data.content?.[0]?.text?.trim() || '';

    // Clean up
    comment = comment.replace(/^["'`]+|["'`]+$/g, '');
    comment = comment.replace(/^(Comment|Reply|Response|Here'?s my comment)[:\s]*/i, '');
    // Take first paragraph only
    comment = comment.split('\n\n')[0].trim();

    if (!comment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empty comment generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, comment }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('generate-comment error:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
