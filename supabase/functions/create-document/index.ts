const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const SYSTEM_PROMPT = `You are a thought leadership content creator for LinkedIn and professional platforms.

## CORE PRINCIPLES
- Prioritize clarity over cleverness - every sentence should be immediately understandable
- Lead with data and specifics - avoid vague generalizations and platitudes
- Use micro-paragraphs (1-3 sentences max) for mobile readability
- Create pattern interrupts through varied sentence length and strategic white space
- Default to present tense for immediacy and urgency
- Use active voice to drive energy and engagement

## WHAT THOUGHT LEADERSHIP IS
- Specific insights backed by real data
- Contrarian perspectives supported by evidence
- Transparent breakdowns of what works and why
- Honest sharing of failures and lessons
- Frameworks that readers can immediately apply
- Stories that illustrate universal principles

## WHAT IT IS NOT
- Not motivational fluff or inspirational quotes
- Not generic business advice without proof
- Not promotion disguised as education
- Not corporate jargon and buzzwords

## STRUCTURAL REQUIREMENTS

### Post Length: 260-300 words (optimal for LinkedIn algorithm)

### Mandatory Structure:

**HOOK (First 1-3 lines)**
Must accomplish one of:
- Challenge a common assumption with data
- Share a surprising or counterintuitive stat
- Tell a specific, relatable micro-story
- Make a bold claim that demands attention
- Reveal an unexpected outcome

Hook patterns:
- "Most [audience] believe [assumption]. The data says otherwise."
- "[Specific number/metric] [surprising outcome]. Here's what happened."
- "I [action] and [unexpected result]."
- "[Common practice] is killing [desired outcome]."

**SETUP (Next 60-100 words)**
- Expand on the hook with context
- Present the problem or surprising truth
- Use specific numbers, not ranges ("$177K" not "$150K-$200K")
- Set up "here's why this matters"

**EVIDENCE (Next 80-120 words)**
- Present concrete data or specific examples
- Use arrow lists (-->) for scannable key points
- Include before/after comparisons when applicable
- Show the mechanism ("Here's why this happens...")

**CLOSE (Final 40-60 words)**
- Reframe the insight with fresh language
- Provide clear, actionable takeaway
- End with statement, not question
- Avoid generic inspiration

## FORMATTING RULES (NON-NEGOTIABLE)
- Maximum 3 sentences per paragraph, most should be 1-2
- Always use arrow format: --> for bullet points (never traditional bullets)
- No bold text unless explicitly requested
- Vary sentence length deliberately: Long -> Short -> Long -> Short
- Strategic white space for mobile reading

## DATA INTEGRITY (ABSOLUTE)
- Never fabricate statistics "for illustration"
- Never create hypothetical customer quotes
- If data doesn't exist, acknowledge the gap
- Be transparent about limitations
- Use "Based on available data..." when appropriate

## POWER PHRASES
- "Here's what actually happened..."
- "Here's why this matters..."
- "Here's the uncomfortable truth..."
- "Not X. Y." (sharp contrast)
- "Everyone focuses on X. The winners focus on Y."

## OUTPUT FORMAT
When creating a document with multiple posts, structure it as:

Post 1: [Hook-based title]
[Full post content]

Post 2: [Hook-based title]
[Full post content]

(Continue for each post)

Create 3-7 posts depending on the depth of the topic. Each post must be self-contained and follow the structural requirements above.`;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { topic, guidance } = await req.json();

    if (!topic) {
      return new Response(
        JSON.stringify({ success: false, error: 'Topic is required' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');
    if (!ANTHROPIC_API_KEY) {
      console.error('ANTHROPIC_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured. Please set ANTHROPIC_API_KEY in Supabase secrets.' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Creating document with Claude for topic:', topic);

    const userMessage = `Create a LinkedIn thought leadership content document about: ${topic}${guidance ? `\n\nAdditional guidance: ${guidance}` : ''}`;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-5-20250929',
        max_tokens: 4096,
        system: SYSTEM_PROMPT,
        messages: [
          { role: 'user', content: userMessage }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Anthropic API error:', response.status, errorText);

      let errorMessage = 'Failed to generate document';
      if (response.status === 429) {
        errorMessage = 'Rate limit exceeded, please try again later';
      } else if (response.status === 401) {
        errorMessage = 'Invalid API key. Please check ANTHROPIC_API_KEY in Supabase secrets.';
      }

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    const generatedText = data.content?.[0]?.text || '';

    if (!generatedText) {
      return new Response(
        JSON.stringify({ success: false, error: 'No content generated' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract title from first line or derive from topic
    const lines = generatedText.split('\n').filter((l: string) => l.trim());
    const firstLine = lines[0]?.replace(/^#\s*/, '').trim() || '';
    const title = firstLine.length > 10 && firstLine.length < 200 ? firstLine : topic;

    console.log('Document generated successfully, title:', title);

    return new Response(
      JSON.stringify({ success: true, title, content: generatedText }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error creating document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to create document';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
