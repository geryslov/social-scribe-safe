// =============================================================================
// generate-comment — Post classification agent + comment generation
//
// Phase 1: Classify the post (type, subject, entities, event, tone)
// Phase 2: Generate comment using type-specific strategy + publisher voice
//
// Input:  { post_content, author_name, publisher_name, voice_profile? }
// Output: { success, comment, classification }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a comment-writing agent. You work in two phases and return a structured JSON response.

PHASE 1 — CLASSIFY THE POST

Read the post and determine:
- post_type: match against these known types, or create a new one if none fit:

  announcement_funding: Someone announcing a funding round or investment.
  announcement_launch: Product launch, feature release, new tool.
  announcement_hire: New job, new role, joined a company.
  announcement_milestone: Revenue milestone, anniversary, award, achievement.
  opinion_hot_take: Contrarian view, industry argument, strong position.
  opinion_lesson: Industry recap with analysis, lessons learned, reflection with a point of view.
  data_insight: Stats, research findings, benchmarks, data-driven observation.
  story_personal: Personal story, vulnerability, career journey.
  educational: How-to, framework, tips, playbook, step-by-step advice.
  question: Asking the audience something directly.
  promotion: Hiring post, event, webinar, selling something.

  If the post doesn't fit any of these, create a new type label that describes it and infer the comment strategy from the post's nature.

- subject: the company, person, or product the post is about (by name, short)
- comment_strategy: one short phrase describing what to focus the comment on (e.g. "1-sentence congrats mentioning company")

PHASE 2 — WRITE THE COMMENT

Use the classification to decide WHAT to comment about. Use the publisher's voice profile to decide HOW to say it.

TYPE-SPECIFIC STRATEGIES:

announcement_funding:
  ONE sentence max. Congrats + mention company or investors by name. No analysis, no personal experience, no strategy commentary. Keep it short and genuine.
  If the post is a ROUNDUP of multiple funding rounds (a curated list, "top funding announcements today", etc.), do NOT congratulate. Pick ONE round from the list and react to a specific deal fact: the size, the stage, an investor name, or what the timing or investor mix implies. Do not describe what the company makes, the post already did that.

announcement_launch:
  Note what specifically caught your attention about the product. Mention it by name. One sentence.

announcement_hire:
  Acknowledge the move. Mention the company by name. Brief.

announcement_milestone:
  Congrats + reference the specific achievement. One sentence.

opinion_hot_take:
  Engage with their SPECIFIC argument. Agree with a nuance, push back on one point, or note which part you see playing out. Reference a specific detail they mentioned (a person they quoted, a framework they used). One to two sentences.

opinion_lesson:
  Comment on their ANALYSIS or interpretation, not the facts/recap. Pick ONE specific implication or insight they drew. One to two sentences.

data_insight:
  React to a SPECIFIC number or finding. Don't summarize. One sentence.

story_personal:
  Brief connection or acknowledgment. Don't make it about yourself. One sentence.

educational:
  Pick ONE specific point from their framework or advice. React to that, don't summarize all their points. One sentence.

question:
  Answer briefly or add a perspective. One to two sentences.

promotion:
  Signal boost briefly, or note what's specifically interesting about the role/event/product. One sentence.

For any new/custom type: infer the strategy following the same pattern. Focus on what to react to, keep it to one or two sentences.

ABSOLUTE RULES (apply to ALL types, override everything):

1. NEVER use em dashes (the character). Use periods or commas.
2. NEVER use these phrases: "changes everything", "game changer", "this is huge", "so important", "couldn't agree more", "spot on", "nailed it", "this resonates", "Great post!", "Love this!", "So true!", "keeps me up at night", "let that sink in", "the real story here", "the real story", "the one that matters most", "this is what people miss", "the read here", "interesting move", "smart timing", "serious infrastructure", "serious play"
3. NEVER use dramatic or hyperbolic framing. No LinkedIn influencer energy. Avoid vague intensifiers that praise without making a claim ("serious", "real", "the read", "interesting", "smart") — every adjective should be load-bearing.
4. Your comment MUST mention the subject of the post by name (company, person, product).
5. Respond to what HAPPENED or what was ARGUED, not the general topic area. For funding posts specifically: don't describe what the company does (the post already did) — react to the round (size, stage, investor mix, what it signals).
6. Max 2 sentences. 1 is usually better.
7. Match the publisher's voice profile for tone, vocabulary, and formality. The voice profile decides HOW you sound. The classification decides WHAT you talk about.

OUTPUT FORMAT

Return ONLY a JSON object, nothing else, no markdown fences:

{"post_type":"...","subject":"...","comment_strategy":"...","comment":"..."}

The comment field is the raw comment text only. No quotes inside, no "Comment:" prefix, no headers.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { post_content, author_name, publisher_name, voice_profile } = await req.json();

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

    let userMessage = '';

    if (voice_profile) {
      userMessage += `You are ${publisher_name}. Your voice profile:\n${voice_profile}\n\n`;
    } else {
      userMessage += `You are ${publisher_name}.\n\n`;
    }

    userMessage += `Post by ${author_name || 'someone'}:\n\n"""\n${post_content.slice(0, 2500)}\n"""\n\nClassify it and write the comment. Return the JSON object only.`;

    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 300,
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

    let comment = '';
    let classification: { post_type?: string; subject?: string; comment_strategy?: string } = {};

    // Try parsing as JSON first (the expected path)
    const jsonMatch = raw.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      try {
        const parsed = JSON.parse(jsonMatch[0]);
        if (typeof parsed.comment === 'string') {
          comment = parsed.comment.trim();
        }
        classification = {
          post_type: typeof parsed.post_type === 'string' ? parsed.post_type : undefined,
          subject: typeof parsed.subject === 'string' ? parsed.subject : undefined,
          comment_strategy: typeof parsed.comment_strategy === 'string' ? parsed.comment_strategy : undefined,
        };
      } catch {
        // fall through to raw-text fallback
      }
    }

    // Fallback: treat the response as raw comment text with old strip logic
    if (!comment) {
      comment = raw;
      comment = comment.replace(/\*\*CLASSIFICATION[^*]*\*\*[\s\S]*?(?=\n[A-Z]|$)/i, '').trim();
      comment = comment.replace(/^[\s\S]*?(?:post_type|emotional_tone|core_event)[^\n]*\n/gim, '').trim();
      comment = comment.replace(/^-\s*(post_type|subject|key_entities|core_event|emotional_tone|comment_strategy)[:\s][^\n]*\n?/gim, '').trim();
      const paragraphs = comment.split('\n\n').map((p: string) => p.trim()).filter(Boolean);
      comment = paragraphs[paragraphs.length - 1] || comment;
    }

    // Common cleanup on the comment
    comment = comment.replace(/^["'`]+|["'`]+$/g, '');
    comment = comment.replace(/^(Comment|Reply|Response|Here'?s my comment|\*\*Comment[:\s]*\*\*)[:\s]*/i, '');
    comment = comment.trim();

    if (!comment) {
      return new Response(
        JSON.stringify({ success: false, error: 'Empty comment generated' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, comment, classification }),
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
