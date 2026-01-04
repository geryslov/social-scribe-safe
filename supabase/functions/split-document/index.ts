const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, title } = await req.json();

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

    console.log('Splitting document into posts:', title);

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
            content: `You are an expert content strategist who splits long-form content into engaging LinkedIn posts.

Your task is to analyze the document and split it into multiple standalone LinkedIn posts.

Guidelines for splitting:
- Each post should be self-contained and make sense on its own
- Each post should be between 150-300 words (LinkedIn optimal length)
- Preserve the key insights and value from the original content
- Each post should have a hook/opening that grabs attention
- Include relevant emojis where appropriate
- End with a call-to-action or thought-provoking question when suitable
- Skip sections like "Data Sources", "Appendix", "References" - don't create posts from those
- Create 3-10 posts depending on content length

Return the posts as a JSON array of strings, where each string is a complete LinkedIn post.`
          },
          {
            role: 'user',
            content: `Split this document into LinkedIn posts:\n\nTitle: ${title || 'Untitled'}\n\nContent:\n${content.substring(0, 15000)}`
          }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'split_to_posts',
              description: 'Split the document content into multiple LinkedIn posts',
              parameters: {
                type: 'object',
                properties: {
                  posts: {
                    type: 'array',
                    items: { type: 'string' },
                    description: 'Array of LinkedIn posts extracted from the document'
                  }
                },
                required: ['posts'],
                additionalProperties: false
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'split_to_posts' } }
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
        JSON.stringify({ success: false, error: 'Failed to split document' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract posts from tool call response
    let posts: string[] = [];
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    
    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        posts = args.posts || [];
      } catch (e) {
        console.error('Failed to parse tool call arguments:', e);
      }
    }

    // Fallback: try to parse from content if tool call fails
    if (posts.length === 0 && data.choices?.[0]?.message?.content) {
      try {
        const content = data.choices[0].message.content;
        const match = content.match(/\[.*\]/s);
        if (match) {
          posts = JSON.parse(match[0]);
        }
      } catch (e) {
        console.error('Failed to parse posts from content:', e);
      }
    }

    // Validate posts
    posts = posts.filter((p: any) => typeof p === 'string' && p.trim().length > 0);

    console.log(`Split document into ${posts.length} posts`);

    return new Response(
      JSON.stringify({ success: true, posts }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error splitting document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to split document';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
