const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { content, title, publisherNames } = await req.json();
    const knownWriters: string[] = Array.isArray(publisherNames)
      ? publisherNames.filter((n: unknown): n is string => typeof n === 'string' && n.trim().length > 0)
      : [];

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

If the source content prefixes posts with a "Writer: <Name>" line, capture that
name in the writer_name field for that post and DROP the "Writer:" line from
the returned content. If a post has no such label, return writer_name as null.
${knownWriters.length > 0 ? `Known writers for this document: ${knownWriters.join(', ')}. Prefer matching writer_name to one of those names exactly when possible.` : ''}

Return each post as { content, writer_name } where content is the body of the
post (without the Writer label) and writer_name is the writer's name or null.`
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
                    items: {
                      type: 'object',
                      properties: {
                        content: { type: 'string', description: 'The LinkedIn post body, without any "Writer:" prefix line' },
                        writer_name: { type: ['string', 'null'], description: 'The writer this post should be attributed to, or null if no Writer: label was present' },
                      },
                      required: ['content', 'writer_name'],
                      additionalProperties: false
                    },
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
    type RawPost = { content?: string; writer_name?: string | null } | string;
    let rawPosts: RawPost[] = [];
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];

    if (toolCall?.function?.arguments) {
      try {
        const args = JSON.parse(toolCall.function.arguments);
        rawPosts = Array.isArray(args.posts) ? args.posts : [];
      } catch (e) {
        console.error('Failed to parse tool call arguments:', e);
      }
    }

    // Fallback: try to parse from content if tool call fails
    if (rawPosts.length === 0 && data.choices?.[0]?.message?.content) {
      try {
        const content = data.choices[0].message.content;
        const match = content.match(/\[.*\]/s);
        if (match) {
          const parsed = JSON.parse(match[0]);
          if (Array.isArray(parsed)) rawPosts = parsed;
        }
      } catch (e) {
        console.error('Failed to parse posts from content:', e);
      }
    }

    // Normalize to { content, writer_name } objects. Tolerate the legacy
    // string-only shape so older clients keep working.
    const stripWriterPrefix = (text: string): { body: string; writer: string | null } => {
      const m = text.match(/^\s*(?:#+\s*)?Writer\s*[:\-—]\s*([^\n]+)\n?/i);
      if (m) {
        return { body: text.substring(m[0].length).trimStart(), writer: m[1].trim() };
      }
      return { body: text, writer: null };
    };

    const posts = rawPosts
      .map((p): { content: string; writer_name: string | null } | null => {
        if (typeof p === 'string') {
          const { body, writer } = stripWriterPrefix(p);
          return body.trim() ? { content: body, writer_name: writer } : null;
        }
        if (p && typeof p === 'object' && typeof p.content === 'string') {
          const { body, writer } = stripWriterPrefix(p.content);
          const writer_name = p.writer_name?.trim?.() || writer || null;
          return body.trim() ? { content: body, writer_name } : null;
        }
        return null;
      })
      .filter((p): p is { content: string; writer_name: string | null } => p !== null);

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
