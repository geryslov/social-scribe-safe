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
const LEGACY_WORKSPACE_ID = 'f26b7a85-d4ad-451e-8585-d9906d5b9f95';

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
  // Reaction breakdown
  reactionLike: number;
  reactionCelebrate: number;
  reactionSupport: number;
  reactionLove: number;
  reactionInsightful: number;
  reactionCurious: number;
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

// Fetch reaction breakdown for a post
async function fetchReactionBreakdown(
  accessToken: string,
  postUrn: string
): Promise<{ like: number; celebrate: number; support: number; love: number; insightful: number; curious: number }> {
  const breakdown = { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, curious: 0 };
  
  try {
    // Try to get reaction breakdown using the socialActions API
    const encodedUrn = encodeURIComponent(postUrn);
    const reactionsUrl = `https://api.linkedin.com/rest/reactions/(entity:${encodedUrn})?q=entity`;
    
    console.log(`Fetching reaction breakdown for ${postUrn}...`);
    
    const response = await fetch(reactionsUrl, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    if (response.ok) {
      const data = await response.json();
      // Parse reaction types from response
      if (data.elements) {
        for (const element of data.elements) {
          const reactionType = element.reactionType?.toLowerCase();
          if (reactionType && reactionType in breakdown) {
            breakdown[reactionType as keyof typeof breakdown]++;
          }
        }
      }
      console.log('Reaction breakdown:', breakdown);
    } else {
      const errorText = await response.text();
      console.log(`Could not fetch reaction breakdown: ${response.status} - ${errorText}`);
    }
  } catch (error) {
    console.error('Error fetching reaction breakdown:', error);
  }
  
  return breakdown;
}

// Fetch analytics for a single post URN using memberCreatorPostAnalytics API
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
    reactionLike: 0,
    reactionCelebrate: 0,
    reactionSupport: 0,
    reactionLove: 0,
    reactionInsightful: 0,
    reactionCurious: 0,
  };

  // The URN format should be: urn:li:ugcPost:xxx or urn:li:share:xxx
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

  // Fetch reaction breakdown if we have reactions
  if (analytics.reactions > 0) {
    const breakdown = await fetchReactionBreakdown(accessToken, postUrn);
    analytics.reactionLike = breakdown.like;
    analytics.reactionCelebrate = breakdown.celebrate;
    analytics.reactionSupport = breakdown.support;
    analytics.reactionLove = breakdown.love;
    analytics.reactionInsightful = breakdown.insightful;
    analytics.reactionCurious = breakdown.curious;
  }

  return analytics;
}

// Save analytics snapshot for trend tracking
async function saveAnalyticsSnapshot(
  supabase: any,
  postId: string,
  analytics: PostAnalytics
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  try {
    // Upsert the snapshot for today
    const { error } = await supabase
      .from('post_analytics_history')
      .upsert({
        post_id: postId,
        snapshot_date: today,
        impressions: analytics.impressions,
        unique_impressions: analytics.uniqueImpressions,
        reactions: analytics.reactions,
        comments: analytics.comments,
        reshares: analytics.reshares,
      }, {
        onConflict: 'post_id,snapshot_date',
      });

    if (error) {
      console.error('Failed to save analytics snapshot:', error);
    } else {
      console.log(`Saved analytics snapshot for post ${postId} on ${today}`);
    }
  } catch (error) {
    console.error('Error saving analytics snapshot:', error);
  }
}

// Fetch profile analytics (followers, profile viewers, search appearances)
async function fetchProfileAnalytics(
  accessToken: string
): Promise<{ followers: number; profileViewers: number; searchAppearances: number }> {
  const result = { followers: 0, profileViewers: 0, searchAppearances: 0 };

  const endpoints = [
    { key: 'followers' as const, url: 'https://api.linkedin.com/rest/memberFollowersCount?q=me' },
    { key: 'profileViewers' as const, url: 'https://api.linkedin.com/rest/memberProfileViewersCount?q=me' },
    { key: 'searchAppearances' as const, url: 'https://api.linkedin.com/rest/memberSearchAppearancesCount?q=me' },
  ];

  for (const endpoint of endpoints) {
    try {
      console.log(`Fetching ${endpoint.key}...`);
      const response = await fetch(endpoint.url, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'LinkedIn-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (response.ok) {
        const data = await response.json();
        // LinkedIn returns count in different field names depending on endpoint
        const count = data.count ?? data.followersCount ?? data.profileViewersCount ?? data.searchAppearancesCount ?? 0;
        result[endpoint.key] = count;
        console.log(`${endpoint.key}: ${count}`);
      } else {
        const errorText = await response.text();
        console.log(`Could not fetch ${endpoint.key}: ${response.status} - ${errorText}`);
      }
    } catch (error) {
      console.error(`Error fetching ${endpoint.key}:`, error);
    }
  }

  return result;
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
      .select('id, name, workspace_id, linkedin_member_id, linkedin_access_token, linkedin_refresh_token, linkedin_token_expires_at')
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

        // Update the post with analytics including reaction breakdown
        const { error: updateError } = await supabase
          .from('posts')
          .update({
            impressions: analytics.impressions,
            unique_impressions: analytics.uniqueImpressions,
            reactions: analytics.reactions,
            comments_count: analytics.comments,
            reshares: analytics.reshares,
            engagement_rate: engagementRate,
            reaction_like: analytics.reactionLike,
            reaction_celebrate: analytics.reactionCelebrate,
            reaction_support: analytics.reactionSupport,
            reaction_love: analytics.reactionLove,
            reaction_insightful: analytics.reactionInsightful,
            reaction_curious: analytics.reactionCurious,
            analytics_fetched_at: new Date().toISOString(),
          })
          .eq('id', post.id);

        if (updateError) {
          console.error(`Failed to update analytics for post ${post.id}:`, updateError);
        } else {
          syncedCount++;
          console.log(`Updated analytics for post ${post.id}: impressions=${analytics.impressions}, reactions=${analytics.reactions}`);
          
          // Save snapshot for trend tracking
          await saveAnalyticsSnapshot(supabase, post.id, analytics);
        }
      } catch (error) {
        console.error(`Error processing post ${post.id}:`, error);
      }
    }

    console.log(`Successfully synced analytics for ${syncedCount} posts`);

    // Fetch profile analytics only for Legacy Data workspace publishers
    let profileAnalytics = null;
    if (publisher.workspace_id === LEGACY_WORKSPACE_ID) {
      console.log('Legacy Data workspace publisher - fetching profile analytics...');
      try {
        profileAnalytics = await fetchProfileAnalytics(accessToken);
        
        const { error: profileUpdateError } = await supabase
          .from('publishers')
          .update({
            profile_viewers: profileAnalytics.profileViewers,
            followers_count: profileAnalytics.followers,
            search_appearances: profileAnalytics.searchAppearances,
            profile_analytics_fetched_at: new Date().toISOString(),
          })
          .eq('id', publisher.id);

        if (profileUpdateError) {
          console.error('Failed to update profile analytics:', profileUpdateError);
        } else {
          console.log('Profile analytics updated:', profileAnalytics);
        }
      } catch (profileError) {
        console.error('Error fetching profile analytics:', profileError);
        // Don't fail the whole sync for profile analytics
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true, 
        syncedCount,
        profileAnalytics,
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
