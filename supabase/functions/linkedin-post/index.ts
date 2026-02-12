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
  
  if (expiresAt.getTime() - now.getTime() > 5 * 60 * 1000) {
    return publisherData.linkedin_access_token;
  }

  if (!publisherData.linkedin_refresh_token) {
    throw new Error('Token expired and no refresh token available');
  }

  console.log('Refreshing LinkedIn access token...');

  const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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
    await supabase.from('publishers').update({ linkedin_connected: false } as Record<string, unknown>).eq('id', publisherData.id);
    throw new Error('Token refresh failed, please reconnect LinkedIn');
  }

  const tokenData = await tokenResponse.json();
  const newExpiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

  await supabase.from('publishers').update({
    linkedin_access_token: tokenData.access_token,
    linkedin_refresh_token: tokenData.refresh_token || publisherData.linkedin_refresh_token,
    linkedin_token_expires_at: newExpiresAt,
  } as Record<string, unknown>).eq('id', publisherData.id);

  return tokenData.access_token;
}

async function uploadImageToLinkedIn(accessToken: string, personUrn: string, mediaUrl: string): Promise<string> {
  // 1. Register upload
  const registerResponse = await fetch('https://api.linkedin.com/v2/assets?action=registerUpload', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      'LinkedIn-Version': '202401',
    },
    body: JSON.stringify({
      registerUploadRequest: {
        recipes: ['urn:li:digitalmediaRecipe:feedshare-image'],
        owner: personUrn,
        serviceRelationships: [{
          relationshipType: 'OWNER',
          identifier: 'urn:li:userGeneratedContent',
        }],
      },
    }),
  });

  if (!registerResponse.ok) {
    const errText = await registerResponse.text();
    console.error('Register upload failed:', errText);
    throw new Error('Failed to register image upload with LinkedIn');
  }

  const registerData = await registerResponse.json();
  const uploadUrl = registerData.value.uploadMechanism['com.linkedin.digitalmedia.uploading.MediaUploadHttpRequest'].uploadUrl;
  const asset = registerData.value.asset;

  // 2. Download the file from storage
  console.log('Downloading media from:', mediaUrl);
  const fileResponse = await fetch(mediaUrl);
  if (!fileResponse.ok) throw new Error('Failed to download media file from storage');
  const fileBuffer = await fileResponse.arrayBuffer();

  // 3. Upload binary to LinkedIn
  const uploadResponse = await fetch(uploadUrl, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/octet-stream',
    },
    body: fileBuffer,
  });

  if (!uploadResponse.ok) {
    const errText = await uploadResponse.text();
    console.error('Image upload to LinkedIn failed:', errText);
    throw new Error('Failed to upload image to LinkedIn');
  }

  console.log('Image uploaded to LinkedIn, asset:', asset);
  return asset;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { publisherId, content, postId, mediaUrl } = await req.json();

    if (!publisherId || !content || !postId) {
      return new Response(
        JSON.stringify({ error: 'publisherId, content, and postId are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

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

    const accessToken = await refreshTokenIfNeeded({
      id: publisher.id,
      linkedin_access_token: publisher.linkedin_access_token,
      linkedin_refresh_token: publisher.linkedin_refresh_token,
      linkedin_token_expires_at: publisher.linkedin_token_expires_at,
    });

    const personUrn = `urn:li:person:${publisher.linkedin_member_id}`;

    // Determine if we have media to upload
    let shareMediaCategory = 'NONE';
    let mediaEntries: unknown[] = [];

    if (mediaUrl) {
      const isVideo = /\.(mp4|mov)$/i.test(mediaUrl);
      if (isVideo) {
        // Video upload via LinkedIn is complex (multi-part), skip for now and fall back to NONE
        console.log('Video upload to LinkedIn not yet supported, posting as text only');
      } else {
        // Image upload
        const asset = await uploadImageToLinkedIn(accessToken, personUrn, mediaUrl);
        shareMediaCategory = 'IMAGE';
        mediaEntries = [{
          status: 'READY',
          media: asset,
        }];
      }
    }

    const linkedinPostPayload: Record<string, unknown> = {
      author: personUrn,
      lifecycleState: 'PUBLISHED',
      specificContent: {
        'com.linkedin.ugc.ShareContent': {
          shareCommentary: { text: content },
          shareMediaCategory,
          ...(mediaEntries.length > 0 ? { media: mediaEntries } : {}),
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
      
      if (postResponse.status === 401) {
        await supabase.from('publishers').update({ linkedin_connected: false } as Record<string, unknown>).eq('id', publisherId);
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

    const linkedinPostUrn = postData.id;
    const linkedinPostUrl = linkedinPostUrn 
      ? `https://www.linkedin.com/feed/update/${linkedinPostUrn}`
      : null;

    const publishedAt = new Date().toISOString();

    const { error: updateError } = await supabase
      .from('posts')
      .update({
        status: 'done',
        published_at: publishedAt,
        linkedin_post_url: linkedinPostUrl,
        linkedin_post_urn: linkedinPostUrn,
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
      JSON.stringify({ success: true, linkedinPostUrl, linkedinPostUrn }),
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
