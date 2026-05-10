import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface SlackNotificationRequest {
  workspaceName: string;
  publisherName: string;
  publishedAt: string;
  workspaceUrl: string;
  workspaceId?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workspaceName, publisherName, publishedAt, workspaceUrl, workspaceId }: SlackNotificationRequest = await req.json();

    // Resolve per-workspace webhook (fallback to global env)
    let slackWebhookUrl: string | null = null;
    if (workspaceId) {
      try {
        const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
        const supabase = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
        );
        const { data: ws } = await supabase
          .from('workspaces')
          .select('slack_webhook_url')
          .eq('id', workspaceId)
          .maybeSingle();
        slackWebhookUrl = (ws?.slack_webhook_url as string | null) || null;
      } catch (e) {
        console.error('Failed to fetch workspace webhook', e);
      }
    }
    if (!slackWebhookUrl) slackWebhookUrl = Deno.env.get('SLACK_WEBHOOK_URL') ?? null;

    if (!slackWebhookUrl) {
      console.log('No Slack webhook configured. Skipping.');
      return new Response(
        JSON.stringify({ skipped: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Sending Slack notification:', { workspaceName, publisherName, publishedAt, workspaceUrl });

    // Format the date
    const formattedDate = new Date(publishedAt).toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    // Create Slack message with blocks for better formatting
    const slackMessage = {
      blocks: [
        {
          type: "header",
          text: {
            type: "plain_text",
            text: `📢 ${workspaceName}`,
            emoji: true
          }
        },
        {
          type: "section",
          fields: [
            {
              type: "mrkdwn",
              text: `*Publisher:*\n${publisherName}`
            },
            {
              type: "mrkdwn",
              text: `*Date:*\n${formattedDate}`
            }
          ]
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `<${workspaceUrl}|View Workspace>`
          }
        }
      ]
    };

    const response = await fetch(slackWebhookUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(slackMessage),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Slack API error:', errorText);
      return new Response(
        JSON.stringify({ error: 'Failed to send Slack notification', details: errorText }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Slack notification sent successfully');

    return new Response(
      JSON.stringify({ success: true }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in notify-slack function:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
