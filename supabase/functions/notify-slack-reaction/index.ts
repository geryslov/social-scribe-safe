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
    const { post_id, actor_name, actor_headline, actor_profile_url, actor_urn, reaction_type } = await req.json();

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Fetch post + workspace context (incl. per-workspace webhook)
    const { data: post } = await supabase
      .from('posts')
      .select('id, content, publisher_name, linkedin_post_url, workspace_id, workspaces(name, slack_webhook_url)')
      .eq('id', post_id)
      .maybeSingle();

    const workspaceWebhook = (post as any)?.workspaces?.slack_webhook_url as string | null | undefined;
    const slackWebhookUrl = workspaceWebhook || Deno.env.get('SLACK_WEBHOOK_URL');

    if (!slackWebhookUrl) {
      console.log('No Slack webhook configured for workspace and no global fallback. Skipping.');
      return new Response(JSON.stringify({ skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    // Total times this actor has reacted across the workspace's posts
    let totalReactions = 1;
    if (actor_urn && (post as any)?.workspace_id) {
      const { data: reactionRows } = await supabase
        .from('post_reactors')
        .select('id, posts!inner(workspace_id)')
        .eq('actor_urn', actor_urn)
        .eq('posts.workspace_id', (post as any).workspace_id);
      if (reactionRows && reactionRows.length > 0) totalReactions = reactionRows.length;
    }

    const emoji = REACTION_EMOJI[(reaction_type || '').toUpperCase()] || '👍';
    const workspaceName = (post as any)?.workspaces?.name || 'Workspace';
    const publisher = post?.publisher_name || 'a publisher';
    const preview = (post?.content || '').slice(0, 140) + ((post?.content?.length || 0) > 140 ? '…' : '');
    const postUrl = post?.linkedin_post_url;
    const nameLink = actor_profile_url ? `<${actor_profile_url}|${actor_name}>` : `*${actor_name}*`;
    const namePart = actor_headline ? `${nameLink} — _${actor_headline}_` : nameLink;
    const reactionLabel = totalReactions === 1 ? '1 reaction' : `${totalReactions} reactions`;

    const reactedToTarget = postUrl
      ? `<${postUrl}|${publisher}'s post>`
      : `${publisher}'s post`;
    const titlePart = actor_headline ? `, ${actor_headline}` : '';

    const message = {
      blocks: [
        {
          type: 'section',
          text: {
            type: 'mrkdwn',
            text: `${emoji} ${nameLink}${titlePart}, reacted to ${reactedToTarget}`,
          },
        },
        {
          type: 'context',
          elements: [{ type: 'mrkdwn', text: `📊 ${reactionLabel} from this person in _${workspaceName}_` }],
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
