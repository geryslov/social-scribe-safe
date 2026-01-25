import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID')!;
const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// LinkedIn API version - must be current active version
const LINKEDIN_VERSION = '202601';

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
  impressions: number;
  membersReached: number;
  reactions: number;
  comments: number;
  reshares: number;
}

// Refresh token if expired
async function refreshTokenIfNeeded(
  publisher: PublisherData,
  supabase: any
): Promise<string> {
  const expiresAt = publisher.linkedin_token_expires_at 
    ? new Date(publisher.linkedin_token_expires_at) 
    : null;
  
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
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
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

// Fetch posts using the REST API with proper Community Management API access
async function fetchLinkedInPosts(
  accessToken: string,
  memberId: string
): Promise<LinkedInPost[]> {
  // Use REST API /rest/posts endpoint with the author finder
  // Requires w_member_social scope from Community Management API
  const authorUrn = `urn:li:person:${memberId}`;
  const postsUrl = new URL('https://api.linkedin.com/rest/posts');
  postsUrl.searchParams.set('author', authorUrn);
  postsUrl.searchParams.set('q', 'author');
  postsUrl.searchParams.set('count', '20');

  console.log('Fetching posts from LinkedIn REST API...');
  console.log('Author URN:', authorUrn);
  
  const response = await fetch(postsUrl.toString(), {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'LinkedIn-Version': LINKEDIN_VERSION,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  });

  const responseText = await response.text();
  
  if (!response.ok) {
    console.error('Failed to fetch posts:', response.status, responseText);
    throw new Error(`Failed to fetch LinkedIn posts: ${response.status} - ${responseText}`);
  }

  const data = JSON.parse(responseText);
  console.log(`Fetched ${data.elements?.length || 0} posts from REST API`);
  
  return (data.elements || []).map((post: any) => ({
    id: post.id,
    commentary: post.commentary || '',
    createdAt: post.createdAt,
    visibility: post.visibility,
    lifecycleState: post.lifecycleState,
  }));
}

// Fetch analytics using memberCreatorPostAnalytics API
// Requires r_member_postAnalytics scope
async function fetchPostAnalytics(
  accessToken: string,
  postUrns: string[]
): Promise<Map<string, PostAnalytics>> {
  const analyticsMap = new Map<string, PostAnalytics>();
  
  if (postUrns.length === 0) return analyticsMap;

  console.log(`Fetching analytics for ${postUrns.length} posts using memberCreatorPostAnalytics...`);

  for (const postUrn of postUrns) {
    try {
      // Determine URN type and format for the API
      // URN format: urn:li:ugcPost:123 or urn:li:share:123
      const isUgcPost = postUrn.includes('ugcPost');
      const entityParam = isUgcPost 
        ? `(ugcPost:${encodeURIComponent(postUrn)})`
        : `(share:${encodeURIComponent(postUrn)})`;

      const metrics = ['IMPRESSION', 'MEMBERS_REACHED', 'REACTION', 'COMMENT', 'RESHARE'];
      const analytics: PostAnalytics = {
        impressions: 0,
        membersReached: 0,
        reactions: 0,
        comments: 0,
        reshares: 0,
      };

      // Fetch each metric type
      for (const metric of metrics) {
        try {
          const analyticsUrl = `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=${entityParam}&queryType=${metric}&aggregation=TOTAL`;
          
          const response = await fetch(analyticsUrl, {
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'LinkedIn-Version': LINKEDIN_VERSION,
              'X-Restli-Protocol-Version': '2.0.0',
            },
          });

          if (response.ok) {
            const data = await response.json();
            const count = data.elements?.[0]?.count || 0;
            
            switch (metric) {
              case 'IMPRESSION':
                analytics.impressions = count;
                break;
              case 'MEMBERS_REACHED':
                analytics.membersReached = count;
                break;
              case 'REACTION':
                analytics.reactions = count;
                break;
              case 'COMMENT':
                analytics.comments = count;
                break;
              case 'RESHARE':
                analytics.reshares = count;
                break;
            }
          } else {
            const errorText = await response.text();
            console.log(`Could not fetch ${metric} for ${postUrn}: ${response.status}`);
          }
        } catch (metricError) {
          console.error(`Error fetching ${metric} for ${postUrn}:`, metricError);
        }
      }

      analyticsMap.set(postUrn, analytics);
    } catch (error) {
      console.error(`Error fetching analytics for ${postUrn}:`, error);
      analyticsMap.set(postUrn, {
        impressions: 0,
        membersReached: 0,
        reactions: 0,
        comments: 0,
        reshares: 0,
      });
    }
  }

  return analyticsMap;
}

Deno.serve(async (req) => {
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

    const accessToken = await refreshTokenIfNeeded(publisher as PublisherData, supabase);

    // Fetch posts from LinkedIn
    const posts = await fetchLinkedInPosts(accessToken, publisher.linkedin_member_id);

    if (posts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, posts: [], syncedCount: 0, message: 'No posts found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract post URNs for analytics fetch
    const postUrns = posts.map(p => p.id);

    // Fetch analytics for all posts
    const analyticsMap = await fetchPostAnalytics(accessToken, postUrns);

    // Prepare posts for upsert
    const postsToUpsert = posts.map(post => {
      const analytics = analyticsMap.get(post.id) || {
        impressions: 0,
        membersReached: 0,
        reactions: 0,
        comments: 0,
        reshares: 0,
      };
      
      const totalEngagements = analytics.reactions + analytics.comments + analytics.reshares;
      const engagementRate = analytics.impressions > 0 
        ? parseFloat(((totalEngagements / analytics.impressions) * 100).toFixed(2))
        : null;

      return {
        publisher_id: publisherId,
        linkedin_post_urn: post.id,
        content: post.commentary || null,
        published_at: post.createdAt ? new Date(post.createdAt).toISOString() : null,
        impressions: analytics.impressions,
        reactions: analytics.reactions,
        comments: analytics.comments,
        reshares: analytics.reshares,
        engagement_rate: engagementRate,
        fetched_at: new Date().toISOString(),
      };
    });

    const { error: upsertError } = await supabase
      .from('linkedin_posts')
      .upsert(postsToUpsert, { onConflict: 'publisher_id,linkedin_post_urn' });

    if (upsertError) {
      console.error('Failed to upsert posts:', upsertError);
      return new Response(
        JSON.stringify({ error: 'Failed to save posts to database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Successfully synced ${postsToUpsert.length} posts`);

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
