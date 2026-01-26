import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID')!;
const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

// LinkedIn API version
const LINKEDIN_VERSION = '202601';

interface PublisherData {
  id: string;
  linkedin_member_id: string;
  linkedin_access_token: string;
  linkedin_refresh_token: string | null;
  linkedin_token_expires_at: string | null;
}

interface AppPublishedPost {
  id: string;
  linkedin_post_urn: string;
  publisher_name: string;
  content: string;
  published_at: string;
}

interface PostAnalytics {
  impressions: number;
  uniqueImpressions: number;
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

// Fetch analytics for a single post URN using memberCreatorPostAnalytics API
// This uses the r_member_postAnalytics scope
async function fetchPostAnalytics(
  accessToken: string,
  postUrn: string
): Promise<PostAnalytics> {
  const analytics: PostAnalytics = {
    impressions: 0,
    uniqueImpressions: 0,
    reactions: 0,
    comments: 0,
    reshares: 0,
  };

  // The URN format should be: urn:li:ugcPost:xxx or urn:li:share:xxx
  // For memberCreatorPostAnalytics, we need to format the entity parameter correctly
  const isUgcPost = postUrn.includes('ugcPost');
  const isShare = postUrn.includes('share');
  
  if (!isUgcPost && !isShare) {
    console.log(`Unknown URN format: ${postUrn}, skipping analytics`);
    return analytics;
  }

  // Format: (ugcPost:urn:li:ugcPost:xxx) or (share:urn:li:share:xxx)
  const entityType = isUgcPost ? 'ugcPost' : 'share';
  const entityParam = `(${entityType}:${encodeURIComponent(postUrn)})`;

  const metrics = ['IMPRESSION', 'MEMBERS_REACHED', 'REACTION', 'COMMENT', 'RESHARE'];

  for (const metric of metrics) {
    try {
      const analyticsUrl = `https://api.linkedin.com/rest/memberCreatorPostAnalytics?q=entity&entity=${entityParam}&queryType=${metric}&aggregation=TOTAL`;
      
      console.log(`Fetching ${metric} for ${postUrn}...`);
      
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
            analytics.uniqueImpressions = count;
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
        console.log(`${metric}: ${count}`);
      } else {
        const errorText = await response.text();
        console.log(`Could not fetch ${metric} for ${postUrn}: ${response.status} - ${errorText}`);
      }
    } catch (metricError) {
      console.error(`Error fetching ${metric} for ${postUrn}:`, metricError);
    }
  }

  return analytics;
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

    console.log('Fetching analytics for app-published posts, publisher:', publisherId);

    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Get publisher with LinkedIn credentials
    const { data: publisher, error: publisherError } = await supabase
      .from('publishers')
      .select('id, name, linkedin_member_id, linkedin_access_token, linkedin_refresh_token, linkedin_token_expires_at')
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

    // Query posts that were published via the app (have linkedin_post_urn set)
    const { data: appPosts, error: postsError } = await supabase
      .from('posts')
      .select('id, linkedin_post_urn, publisher_name, content, published_at')
      .eq('publisher_name', publisher.name)
      .eq('publish_method', 'linkedin_api')
      .not('linkedin_post_urn', 'is', null)
      .order('published_at', { ascending: false });

    if (postsError) {
      console.error('Error fetching app posts:', postsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch app-published posts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!appPosts || appPosts.length === 0) {
      console.log('No app-published posts found for publisher:', publisher.name);
      return new Response(
        JSON.stringify({ 
          success: true, 
          syncedCount: 0, 
          message: 'No app-published posts found to sync analytics for' 
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${appPosts.length} app-published posts to fetch analytics for`);

    // Fetch analytics for each post and update the posts table
    let syncedCount = 0;
    for (const post of appPosts) {
      try {
        const analytics = await fetchPostAnalytics(accessToken, post.linkedin_post_urn);
        
        // Calculate engagement rate
        const totalEngagements = analytics.reactions + analytics.comments + analytics.reshares;
        const engagementRate = analytics.impressions > 0 
          ? parseFloat(((totalEngagements / analytics.impressions) * 100).toFixed(2))
          : null;

        // Update the post with analytics
        const { error: updateError } = await supabase
          .from('posts')
          .update({
            impressions: analytics.impressions,
            unique_impressions: analytics.uniqueImpressions,
            reactions: analytics.reactions,
            comments_count: analytics.comments,
            reshares: analytics.reshares,
            engagement_rate: engagementRate,
            analytics_fetched_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        if (updateError) {
          console.error(`Failed to update analytics for post ${post.id}:`, updateError);
        } else {
          syncedCount++;
          console.log(`Updated analytics for post ${post.id}: impressions=${analytics.impressions}, reactions=${analytics.reactions}`);
        }
      } catch (error) {
        console.error(`Error processing post ${post.id}:`, error);
      }
    }

    console.log(`Successfully synced analytics for ${syncedCount} posts`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        syncedCount,
        message: `Synced analytics for ${syncedCount} posts`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error fetching LinkedIn post analytics:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
