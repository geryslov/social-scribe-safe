const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content } = await req.json();

    if (!content) {
      return new Response(
        JSON.stringify({ success: false, error: 'Content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Analyzing post content for labels...');

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a content analyzer that generates relevant labels/tags for LinkedIn posts.
            
Analyze the post content and return 2-5 relevant labels that describe the topic, theme, or category.

Labels should be:
- Short (1-3 words each)
- Relevant to LinkedIn professional content
- In lowercase with no special characters
- Examples: "leadership", "career advice", "tech trends", "personal branding", "industry insights", "motivation", "networking", "product launch", "company culture", "hiring"

Return ONLY a JSON array of strings with the labels, nothing else.
Example: ["leadership", "career advice", "motivation"]`
          },
          {
            role: 'user',
            content: `Analyze this LinkedIn post and return relevant labels:\n\n${content.substring(0, 1500)}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_labels',
              description: 'Extract relevant labels from the post content',
              parameters: {
                type: 'object',
                properties: {
                  labels: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of 2-5 relevant labels for the post'
                  }
                },
                required: ['labels'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_labels' } }
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
        JSON.stringify({ success: false, error: 'Failed to analyze content' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response:', JSON.stringify(data));

    // Extract labels from tool call response
    let labels: string[] = [];
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        labels = args.labels || [];
      } catch (e) {
        console.error('Failed to parse tool call arguments:', e);
      }
    }

    // Fallback: try to parse from content if tool call fails
    if (labels.length === 0 && data.choices?.[0]?.message?.content) {
      try {
        const content = data.choices[0].message.content;
        const match = content.match(/\[.*\]/s);
        if (match) {
          labels = JSON.parse(match[0]);
        }
      } catch (e) {
        console.error('Failed to parse labels from content:', e);
      }
    }

    // Validate and clean labels
    labels = labels
      .filter((l: any) => typeof l === 'string' && l.length > 0)
      .map((l: string) => l.toLowerCase().trim())
      .slice(0, 5);

    console.log('Extracted labels:', labels);

    return new Response(
      JSON.stringify({ success: true, labels }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error analyzing post:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to analyze post';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
