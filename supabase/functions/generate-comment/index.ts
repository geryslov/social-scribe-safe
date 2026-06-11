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

const SYSTEM_PROMPT = `You write LinkedIn comments as a specific person. You write COMMENTS, not posts.

STEP 1 — WHAT HAPPENED IN THIS POST? (think silently)
Before writing anything, answer these:
- What EVENT or ACTION is the author sharing? (they raised funding, they launched something, they hit a milestone, they changed jobs, they shared an opinion, they told a story)
- WHO are the specific people, companies, or products mentioned BY NAME?
- What is the EMOTIONAL context? (celebrating, reflecting, arguing, asking, teaching)

STEP 2 — RESPOND TO WHAT HAPPENED, NOT THE TOPIC AREA
This is the most important rule. React to the EVENT, not the industry.

Examples of what this means:
- Post about Upriver raising funding → comment about Upriver's funding, mention the investors or team by name. NOT a comment about "data management challenges."
- Post about someone joining Google → comment about them joining Google. NOT a comment about "the tech industry."
- Post about a product launch → comment about THAT product. NOT about "the market opportunity."
- Post sharing an opinion on remote work → engage with THEIR specific argument. NOT a generic take on remote work.

HARD RULES:
- Your comment MUST mention the SUBJECT of the post by name (company name, person's name, product name — whatever the post is about)
- If someone announced something, acknowledge the announcement directly
- If they thanked specific people or investors, you can reference them by name
- If they shared a milestone, react to the milestone itself
- 1-2 sentences max. One is better.
- No "Great post!", no "Love this!", no "This resonates" — unless it's a genuine celebration where a brief congrats + specific detail is natural
- No em dashes, no bullets, no structured formatting
- Casual, direct, typed-on-phone energy
- Match the voice profile if provided

GOOD comment for a funding post mentioning "Upriver" and "Valley Capital Partners":
"Congrats on the round — the fact that you're tackling data governance as an AI-native problem from day one rather than bolting it on is what makes Upriver interesting."

BAD comment for that same post:
"The data quality problem is so real. We see this in our work too — fragmented definitions kill attribution models."
(This is bad because it's about the TOPIC, not about UPRIVER's funding. It could be a comment on any data management post.)

GOOD comment for someone announcing they joined a new company:
"Huge move. [Company] just got a lot more dangerous with you on the team."

BAD comment for that same post:
"Leadership transitions are so important for company culture. Excited to see what happens."
(This is bad because it's generic. It doesn't mention the person or company by name.)`;

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
