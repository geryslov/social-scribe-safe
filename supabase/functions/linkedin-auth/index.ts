import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID')!;
const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// Use the project URL for the redirect
const REDIRECT_URI = `${SUPABASE_URL}/functions/v1/linkedin-auth/callback`;

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const url = new URL(req.url);
  const path = url.pathname.split('/').pop();

  try {
    // GET /start - Begin OAuth flow
    if (req.method === 'GET' && path === 'start') {
      const publisherId = url.searchParams.get('publisher_id');
      const returnUrl = url.searchParams.get('return_url');
      
      if (!publisherId) {
        return new Response(
          JSON.stringify({ error: 'publisher_id is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // State includes publisher ID and return URL for after callback
      const state = btoa(JSON.stringify({ publisherId, returnUrl }));
      
      // Use w_member_social for posting - openid/profile require "Sign In with LinkedIn" product
      const scopes = ['w_member_social'];
      const authUrl = new URL('https://www.linkedin.com/oauth/v2/authorization');
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('client_id', LINKEDIN_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('state', state);
      authUrl.searchParams.set('scope', scopes.join(' '));

      return new Response(null, {
        status: 302,
        headers: {
          ...corsHeaders,
          'Location': authUrl.toString(),
        },
      });
    }

    // GET /callback - Handle OAuth callback from LinkedIn
    if (req.method === 'GET' && path === 'callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');

      if (error) {
        console.error('LinkedIn OAuth error:', error, errorDescription);
        return new Response(
          `<html><body><script>window.opener?.postMessage({ type: 'linkedin-auth-error', error: '${errorDescription || error}' }, '*'); window.close();</script></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      if (!code || !state) {
        return new Response(
          `<html><body><script>window.opener?.postMessage({ type: 'linkedin-auth-error', error: 'Missing code or state' }, '*'); window.close();</script></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      let stateData: { publisherId: string; returnUrl?: string };
      try {
        stateData = JSON.parse(atob(state));
      } catch {
        return new Response(
          `<html><body><script>window.opener?.postMessage({ type: 'linkedin-auth-error', error: 'Invalid state' }, '*'); window.close();</script></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      // Exchange code for access token
      const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'authorization_code',
          code,
          redirect_uri: REDIRECT_URI,
          client_id: LINKEDIN_CLIENT_ID,
          client_secret: LINKEDIN_CLIENT_SECRET,
        }),
      });

      if (!tokenResponse.ok) {
        const errorText = await tokenResponse.text();
        console.error('Token exchange failed:', errorText);
        return new Response(
          `<html><body><script>window.opener?.postMessage({ type: 'linkedin-auth-error', error: 'Failed to exchange code for token' }, '*'); window.close();</script></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      const tokenData = await tokenResponse.json();
      const accessToken = tokenData.access_token;
      const expiresIn = tokenData.expires_in; // seconds
      const refreshToken = tokenData.refresh_token; // May not be provided

      // Get user info from LinkedIn using /v2/me endpoint (doesn't require openid scope)
      const userInfoResponse = await fetch('https://api.linkedin.com/v2/me', {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (!userInfoResponse.ok) {
        const errorText = await userInfoResponse.text();
        console.error('Failed to get user info:', errorText);
        return new Response(
          `<html><body><script>window.opener?.postMessage({ type: 'linkedin-auth-error', error: 'Failed to get LinkedIn profile' }, '*'); window.close();</script></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      const userInfo = await userInfoResponse.json();
      const linkedinMemberId = userInfo.id; // This is the member ID from /v2/me

      // Calculate expiration timestamp
      const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

      // Store tokens in database
      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { error: updateError } = await supabase
        .from('publishers')
        .update({
          linkedin_access_token: accessToken,
          linkedin_refresh_token: refreshToken || null,
          linkedin_token_expires_at: expiresAt,
          linkedin_member_id: linkedinMemberId,
          linkedin_connected: true,
        })
        .eq('id', stateData.publisherId);

      if (updateError) {
        console.error('Failed to save tokens:', updateError);
        return new Response(
          `<html><body><script>window.opener?.postMessage({ type: 'linkedin-auth-error', error: 'Failed to save LinkedIn connection' }, '*'); window.close();</script></body></html>`,
          { headers: { 'Content-Type': 'text/html' } }
        );
      }

      // Success - close popup and notify parent
      return new Response(
        `<html><body><script>window.opener?.postMessage({ type: 'linkedin-auth-success', publisherId: '${stateData.publisherId}' }, '*'); window.close();</script></body></html>`,
        { headers: { 'Content-Type': 'text/html' } }
      );
    }

    // POST /disconnect - Remove LinkedIn connection
    if (req.method === 'POST' && path === 'disconnect') {
      const body = await req.json();
      const { publisherId } = body;

      if (!publisherId) {
        return new Response(
          JSON.stringify({ error: 'publisherId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      const { error: updateError } = await supabase
        .from('publishers')
        .update({
          linkedin_access_token: null,
          linkedin_refresh_token: null,
          linkedin_token_expires_at: null,
          linkedin_member_id: null,
          linkedin_connected: false,
        })
        .eq('id', publisherId);

      if (updateError) {
        console.error('Failed to disconnect:', updateError);
        return new Response(
          JSON.stringify({ error: 'Failed to disconnect LinkedIn' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // POST /refresh - Refresh access token
    if (req.method === 'POST' && path === 'refresh') {
      const body = await req.json();
      const { publisherId } = body;

      if (!publisherId) {
        return new Response(
          JSON.stringify({ error: 'publisherId is required' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
      
      // Get current refresh token
      const { data: publisher, error: fetchError } = await supabase
        .from('publishers')
        .select('linkedin_refresh_token')
        .eq('id', publisherId)
        .single();

      if (fetchError || !publisher?.linkedin_refresh_token) {
        return new Response(
          JSON.stringify({ error: 'No refresh token available' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Refresh the token
      const tokenResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: new URLSearchParams({
          grant_type: 'refresh_token',
          refresh_token: publisher.linkedin_refresh_token,
          client_id: LINKEDIN_CLIENT_ID,
          client_secret: LINKEDIN_CLIENT_SECRET,
        }),
      });

      if (!tokenResponse.ok) {
        console.error('Token refresh failed');
        // Mark as disconnected since refresh failed
        await supabase
          .from('publishers')
          .update({ linkedin_connected: false })
          .eq('id', publisherId);

        return new Response(
          JSON.stringify({ error: 'Token refresh failed, please reconnect' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const tokenData = await tokenResponse.json();
      const expiresAt = new Date(Date.now() + tokenData.expires_in * 1000).toISOString();

      await supabase
        .from('publishers')
        .update({
          linkedin_access_token: tokenData.access_token,
          linkedin_refresh_token: tokenData.refresh_token || publisher.linkedin_refresh_token,
          linkedin_token_expires_at: expiresAt,
        })
        .eq('id', publisherId);

      return new Response(
        JSON.stringify({ success: true }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('LinkedIn auth error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
