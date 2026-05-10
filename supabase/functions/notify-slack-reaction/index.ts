import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REACTION_EMOJI: Record<string, string> = {
  LIKE: '👍', PRAISE: '👏', EMPATHY: '💚', INTEREST: '💡',
  APPRECIATION: '💚', ENTERTAINMENT: '😄', MAYBE: '🤔', INTERESTED: '💡',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL');
    if (!slackWebhookUrl) {
      return new Response(JSON.stringify({ error: 'SLACK_WEBHOOK_URL not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const { post_id, actor_name, actor_headline, actor_profile_url, reaction_type } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch post + workspace context
    const { data: post } = await supabase
      .from('posts')
      .select('id, content, publisher_name, linkedin_post_url, workspace_id, workspaces(name)')
      .eq('id', post_id)
      .maybeSingle();

    const emoji = REACTION_EMOJI[(reaction_type || '').toUpperCase()] || '👍';
    const workspaceName = (post as any)?.workspaces?.name || 'Workspace';
    const publisher = post?.publisher_name || 'a publisher';
    const preview = (post?.content || '').slice(0, 140) + ((post?.content?.length || 0) > 140 ? '…' : '');
    const postUrl = post?.linkedin_post_url;

    const message = {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} *${actor_name}* reacted to *${publisher}*'s post in _${workspaceName}_`,
          },
        },
        ...(actor_headline ? [{
          type: 'context',
          elements: [{ type: 'mrkdwn', text: actor_headline }],
        }] : []),
        ...(preview ? [{
          type: 'section',
          text: { type: 'mrkdwn', text: `> ${preview.replace(/\n/g, '\n> ')}` },
        }] : []),
        {
          type: 'context',
          elements: [{
            type: 'mrkdwn',
            text: [
              actor_profile_url ? `<${actor_profile_url}|View profile>` : null,
              postUrl ? `<${postUrl}|View post>` : null,
            ].filter(Boolean).join(' · ') || ' ',
          }],
        },
      ],
    };

    const resp = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(message),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.error('Slack error:', txt);
      return new Response(JSON.stringify({ error: txt }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    return new Response(JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Unknown error';
    console.error('notify-slack-reaction error:', e);
    return new Response(JSON.stringify({ error: msg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }
});
