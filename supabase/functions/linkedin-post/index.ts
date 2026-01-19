import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID')!;
const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface PublisherTokenData {
  id: string;
  linkedin_access_token: string;
  linkedin_refresh_token: string | null;
  linkedin_token_expires_at: string;
}

async function refreshTokenIfNeeded(publisherData: PublisherTokenData): Promise<string> {
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const expiresAt = new Date(publisherData.linkedin_token_expires_at);
  const now = new Date();
  
  // Refresh if token expires in less than 5 minutes
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return publisherData.linkedin_access_token;
  }

  if (!publisherData.linkedin_refresh_token) {
    throw new Error('Token expired and no refresh token available');
  }

  console.log('Refreshing LinkedIn access token...');

  const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      refresh_token: publisherData.linkedin_refresh_token,
      client_id: LINKEDIN_CLIENT_ID,
      client_secret: LINKEDIN_CLIENT_SECRET,
    }),
  });

  if (!tokenResponse.ok) {
    const errorText = await tokenResponse.text();
    console.error('Token refresh failed:', errorText);
    
    await supabase
      .from('publishers')
      .update({ linkedin_connected: false } as Record<string, unknown>)
      .eq('id', publisherData.id);
    
    throw new Error('Token refresh failed, please reconnect LinkedIn');
  }

  const tokenData = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabase
    .from('publishers')
    .update({
      linkedin_access_token: tokenData.access_token,
      linkedin_refresh_token: tokenData.refresh_token || publisherData.linkedin_refresh_token,
      linkedin_token_expires_at: newExpiresAt,
    } as Record<string, unknown>)
    .eq('id', publisherData.id);

  return tokenData.access_token;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { publisherId, content, postId } = await req.json();

    if (!publisherId || !content || !postId) {
      return new Response(
        JSON.stringify({ error: 'publisherId, content, and postId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get publisher with LinkedIn credentials
    const { data: publisher, error: publisherError } = await supabase
      .from('publishers')
      .select('id, name, linkedin_access_token, linkedin_refresh_token, linkedin_token_expires_at, linkedin_member_id, linkedin_connected')
      .eq('id', publisherId)
      .single();

    if (publisherError || !publisher) {
      console.error('Publisher not found:', publisherError);
      return new Response(
        JSON.stringify({ error: 'Publisher not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!publisher.linkedin_connected || !publisher.linkedin_access_token || !publisher.linkedin_member_id) {
      return new Response(
        JSON.stringify({ error: 'LinkedIn is not connected for this publisher' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded({
      id: publisher.id,
      linkedin_access_token: publisher.linkedin_access_token,
      linkedin_refresh_token: publisher.linkedin_refresh_token,
      linkedin_token_expires_at: publisher.linkedin_token_expires_at,
    });

    // Create LinkedIn post using UGC Posts API
    const linkedinPostPayload = {
      author: `urn:li:person:${publisher.linkedin_member_id}`,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: {
            text: content,
          },
          shareMediaCategory: 'NONE',
        },
      },
      visibility: {
        'com.linkedin.ugc.MemberNetworkVisibility': 'PUBLIC',
      },
    };

    console.log('Posting to LinkedIn:', JSON.stringify(linkedinPostPayload, null, 2));

    const postResponse = await fetch('https://api.linkedin.com/v2/ugcPosts', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
        'X-Restli-Protocol-Version': '2.0.0',
        'LinkedIn-Version': '202401',
      },
      body: JSON.stringify(linkedinPostPayload),
    });

    if (!postResponse.ok) {
      const errorText = await postResponse.text();
      console.error('LinkedIn post failed:', postResponse.status, errorText);
      
      // Check for specific errors
      if (postResponse.status === 401) {
        await supabase
          .from('publishers')
          .update({ linkedin_connected: false } as Record<string, unknown>)
          .eq('id', publisherId);
        
        return new Response(
          JSON.stringify({ error: 'LinkedIn authorization expired, please reconnect' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: `LinkedIn API error: ${errorText}` }),
        { status: postResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const postData = await postResponse.json();
    console.log('LinkedIn post response:', JSON.stringify(postData, null, 2));

    // Extract the post ID from response
    const linkedinPostId = postData.id;
    // Construct the post URL (format: urn:li:share:XXX -> linkedin.com/feed/update/urn:li:share:XXX)
    const linkedinPostUrl = linkedinPostId 
      ? `https://www.linkedin.com/feed/update/${linkedinPostId}`
      : null;

    const publishedAt = new Date().toISOString();

    // Update the post record
    const { error: updateError } = await supabase
      .from('posts')
      .update({
        status: 'done',
        published_at: publishedAt,
        linkedin_post_url: linkedinPostUrl,
        publish_method: 'linkedin_api',
      })
      .eq('id', postId);

    if (updateError) {
      console.error('Failed to update post record:', updateError);
    }

    // Send Slack notification
    try {
      await supabase.functions.invoke('notify-slack', {
        body: {
          workspaceName: 'Wisor',
          publisherName: publisher.name,
          publishedAt,
          workspaceUrl: 'https://id-preview--9b39716c-1c6a-40d5-9926-bcbb6451eb2b.lovable.app',
          linkedinPostUrl,
        },
      });
    } catch (slackError) {
      console.error('Failed to send Slack notification:', slackError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        linkedinPostUrl,
        linkedinPostId,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('LinkedIn post error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
