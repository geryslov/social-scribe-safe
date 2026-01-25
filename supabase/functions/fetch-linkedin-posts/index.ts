import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID')!;
const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface PublisherData {
  id: string;
  linkedin_member_id: string;
  linkedin_access_token: string;
  linkedin_refresh_token: string | null;
  linkedin_token_expires_at: string | null;
}

interface LinkedInPost {
  id: string;
  commentary?: string;
  createdAt?: number;
  visibility?: string;
  lifecycleState?: string;
}

interface PostAnalytics {
  impressionCount?: number;
  likeCount?: number;
  commentCount?: number;
  shareCount?: number;
  uniqueImpressionsCount?: number;
  engagementRate?: number;
}

// Refresh token if expired
async function refreshTokenIfNeeded(
  publisher: PublisherData,
  // deno-lint-ignore no-explicit-any
  supabase: any
): Promise<string> {
  const expiresAt = publisher.linkedin_token_expires_at 
    ? new Date(publisher.linkedin_token_expires_at) 
    : null;
  
  // Check if token is expired or will expire in the next 5 minutes
  const isExpired = expiresAt && expiresAt.getTime() < Date.now() + 5 * 60 * 1000;
  
  if (!isExpired) {
    return publisher.linkedin_access_token;
  }

  if (!publisher.linkedin_refresh_token) {
    throw new Error('Token expired and no refresh token available. Please reconnect LinkedIn.');
  }

  console.log('Refreshing expired LinkedIn token...');
  
  const refreshResponse = await fetch('https://www.linkedin.com/oauth/v2/accessToken', {
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

  if (!refreshResponse.ok) {
    const errorText = await refreshResponse.text();
    console.error('Token refresh failed:', errorText);
    throw new Error('Failed to refresh LinkedIn token. Please reconnect.');
  }

  const tokenData = await refreshResponse.json();
  const newAccessToken = tokenData.access_token;
  const expiresIn = tokenData.expires_in;
  const newRefreshToken = tokenData.refresh_token || publisher.linkedin_refresh_token;
  const newExpiresAt = new Date(Date.now() + expiresIn * 1000).toISOString();

  // Update tokens in database
  await supabase
    .from('publishers')
    .update({
      linkedin_access_token: newAccessToken,
      linkedin_refresh_token: newRefreshToken,
      linkedin_token_expires_at: newExpiresAt,
    })
    .eq('id', publisher.id);

  console.log('Token refreshed successfully');
  return newAccessToken;
}

// Fetch posts from LinkedIn
async function fetchLinkedInPosts(
  accessToken: string,
  memberId: string
): Promise<LinkedInPost[]> {
  const postsUrl = new URL('https://api.linkedin.com/rest/posts');
  postsUrl.searchParams.set('author', `urn:li:person:${memberId}`);
  postsUrl.searchParams.set('q', 'author');
  postsUrl.searchParams.set('count', '20');
  postsUrl.searchParams.set('sortBy', 'LAST_MODIFIED');

  console.log('Fetching posts from LinkedIn...');
  
  const response = await fetch(postsUrl.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'LinkedIn-Version': '202601',
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error('Failed to fetch posts:', response.status, errorText);
    throw new Error(`Failed to fetch LinkedIn posts: ${response.status}`);
  }

  const data = await response.json();
  console.log(`Fetched ${data.elements?.length || 0} posts`);
  return data.elements || [];
}

// Fetch analytics for a single post
async function fetchPostAnalytics(
  accessToken: string,
  memberId: string,
  postUrns: string[]
): Promise<Map<string, PostAnalytics>> {
  const analyticsMap = new Map<string, PostAnalytics>();
  
  if (postUrns.length === 0) return analyticsMap;

  // Use the analytics endpoint for share statistics
  // The correct endpoint is /rest/organizationalEntityShareStatistics for personal posts
  // But for member posts we use /rest/shares with projection
  
  // For member creator posts, we need to use a different approach
  // Let's try fetching individual post stats
  console.log(`Fetching analytics for ${postUrns.length} posts...`);

  // Batch fetch using shares endpoint with projection
  for (const postUrn of postUrns) {
    try {
      // Convert post URN to share URN format
      // Post URN: urn:li:share:123456 or urn:li:ugcPost:123456
      const shareId = postUrn.split(':').pop();
      
      // Try the socialActions endpoint for engagement metrics
      const actionsUrl = `https://api.linkedin.com/rest/socialActions/${encodeURIComponent(postUrn)}`;
      
      const response = await fetch(actionsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'LinkedIn-Version': '202601',
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (response.ok) {
        const data = await response.json();
        analyticsMap.set(postUrn, {
          likeCount: data.likesSummary?.totalLikes || 0,
          commentCount: data.commentsSummary?.totalFirstLevelComments || 0,
          shareCount: 0, // Not available in this endpoint
        });
      } else {
        console.log(`Could not fetch analytics for ${postUrn}: ${response.status}`);
        analyticsMap.set(postUrn, { likeCount: 0, commentCount: 0, shareCount: 0 });
      }
    } catch (error) {
      console.error(`Error fetching analytics for ${postUrn}:`, error);
      analyticsMap.set(postUrn, { likeCount: 0, commentCount: 0, shareCount: 0 });
    }
  }

  return analyticsMap;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { publisherId } = await req.json();

    if (!publisherId) {
      return new Response(
        JSON.stringify({ error: 'publisherId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching LinkedIn posts for publisher:', publisherId);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Fetch publisher data
    const { data: publisher, error: publisherError } = await supabase
      .from('publishers')
      .select('id, linkedin_member_id, linkedin_access_token, linkedin_refresh_token, linkedin_token_expires_at')
      .eq('id', publisherId)
      .single();

    if (publisherError || !publisher) {
      console.error('Publisher not found:', publisherError);
      return new Response(
        JSON.stringify({ error: 'Publisher not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!publisher.linkedin_member_id || !publisher.linkedin_access_token) {
      return new Response(
        JSON.stringify({ error: 'Publisher not connected to LinkedIn' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Refresh token if needed
    const accessToken = await refreshTokenIfNeeded(publisher as PublisherData, supabase);

    // Fetch posts from LinkedIn
    const posts = await fetchLinkedInPosts(accessToken, publisher.linkedin_member_id);

    if (posts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, posts: [], message: 'No posts found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract post URNs for analytics fetch
    const postUrns = posts.map(p => p.id);

    // Fetch analytics for all posts
    const analyticsMap = await fetchPostAnalytics(accessToken, publisher.linkedin_member_id, postUrns);

    // Prepare posts for upsert
    const postsToUpsert = posts.map(post => {
      const analytics = analyticsMap.get(post.id) || {};
      const reactions = analytics.likeCount || 0;
      const comments = analytics.commentCount || 0;
      const reshares = analytics.shareCount || 0;
      const impressions = analytics.impressionCount || 0;
      
      // Calculate engagement rate if we have impressions
      const totalEngagements = reactions + comments + reshares;
      const engagementRate = impressions > 0 
        ? parseFloat(((totalEngagements / impressions) * 100).toFixed(2))
        : null;

      return {
        publisher_id: publisherId,
        linkedin_post_urn: post.id,
        content: post.commentary || null,
        published_at: post.createdAt ? new Date(post.createdAt).toISOString() : null,
        impressions,
        reactions,
        comments,
        reshares,
        engagement_rate: engagementRate,
        fetched_at: new Date().toISOString(),
      };
    });

    // Upsert posts to database
    const { error: upsertError } = await supabase
      .from('linkedin_posts')
      .upsert(postsToUpsert, {
        onConflict: 'publisher_id,linkedin_post_urn',
      });

    if (upsertError) {
      console.error('Failed to upsert posts:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save posts to database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully synced ${postsToUpsert.length} posts`);

    // Fetch the updated posts from database
    const { data: savedPosts } = await supabase
      .from('linkedin_posts')
      .select('*')
      .eq('publisher_id', publisherId)
      .order('published_at', { ascending: false });

    return new Response(
      JSON.stringify({ 
        success: true, 
        posts: savedPosts || [],
        syncedCount: postsToUpsert.length,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching LinkedIn posts:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
