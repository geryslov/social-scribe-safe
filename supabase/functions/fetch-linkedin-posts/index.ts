import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const LINKEDIN_CLIENT_ID = Deno.env.get('LINKEDIN_CLIENT_ID')!;
const LINKEDIN_CLIENT_SECRET = Deno.env.get('LINKEDIN_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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
  reactionLike: number;
  reactionCelebrate: number;
  reactionSupport: number;
  reactionLove: number;
  reactionInsightful: number;
  reactionCurious: number;
}

interface ReactorData {
  actor_urn: string;
  actor_name: string;
  actor_headline: string | null;
  actor_profile_url: string | null;
  reaction_type: string;
}

interface CommentData {
  actor_urn: string;
  actor_name: string;
  actor_headline: string | null;
  actor_profile_url: string | null;
  content: string;
  commented_at: string | null;
  linkedin_comment_urn: string | null;
  parent_comment_urn: string | null;
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

// Batch resolve actor URNs to names via LinkedIn People API
async function resolveActorNames(
  accessToken: string,
  actorUrns: string[]
): Promise<Map<string, { name: string; headline: string | null; profileUrl: string | null }>> {
  const resolved = new Map<string, { name: string; headline: string | null; profileUrl: string | null }>();
  
  if (actorUrns.length === 0) return resolved;

  // Deduplicate
  const uniqueUrns = [...new Set(actorUrns)];
  
  // Process in batches of 20
  const batchSize = 20;
  for (let i = 0; i < uniqueUrns.length; i += batchSize) {
    const batch = uniqueUrns.slice(i, i + batchSize);
    
    for (const urn of batch) {
      try {
        // Extract person ID from URN (urn:li:person:XXXXX or urn:li:member:XXXXX)
        const personId = urn.replace('urn:li:person:', '').replace('urn:li:member:', '');
        const url = `https://api.linkedin.com/rest/people/(id:${personId})`;
        
        const response = await fetch(url, {
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'LinkedIn-Version': LINKEDIN_VERSION,
            'X-Restli-Protocol-Version': '2.0.0',
          },
        });

        if (response.ok) {
          const data = await response.json();
          const firstName = data.firstName?.localized?.en_US || data.firstName || '';
          const lastName = data.lastName?.localized?.en_US || data.lastName || '';
          const name = `${firstName} ${lastName}`.trim() || 'LinkedIn Member';
          const headline = data.headline?.localized?.en_US || data.headline || null;
          const vanityName = data.vanityName;
          const profileUrl = vanityName ? `https://www.linkedin.com/in/${vanityName}` : null;
          
          resolved.set(urn, { name, headline, profileUrl });
        } else if (response.status === 429) {
          console.log('Rate limited on People API, stopping batch resolution');
          break;
        } else {
          console.log(`Could not resolve ${urn}: ${response.status}`);
          resolved.set(urn, { name: 'LinkedIn Member', headline: null, profileUrl: null });
        }
      } catch (error) {
        console.error(`Error resolving ${urn}:`, error);
        resolved.set(urn, { name: 'LinkedIn Member', headline: null, profileUrl: null });
      }
    }
  }
  
  return resolved;
}

// Extract actor URN from LinkedIn reaction element across known shapes
function extractReactionActorUrn(element: any): string | null {
  const directCandidates = [
    element?.actor,
    element?.created?.actor,
    element?.lastModified?.actor,
    element?.actor?.actorId,
    element?.actor?.urn,
    element?.actor?.['$URN'],
  ];

  for (const candidate of directCandidates) {
    if (typeof candidate === 'string' && (candidate.startsWith('urn:li:person:') || candidate.startsWith('urn:li:member:'))) {
      return candidate;
    }
  }

  // Fallback: parse from reaction id e.g. urn:li:reaction:(urn:li:person:ABC,urn:li:share:XYZ)
  const reactionId = element?.id;
  if (typeof reactionId === 'string') {
    const match = reactionId.match(/\((urn:li:(?:person|member):[^,]+),/);
    if (match?.[1]) return match[1];
  }

  return null;
}

// Fetch reaction breakdown for a post AND collect reactor data
async function fetchReactionBreakdown(
  accessToken: string,
  postUrn: string
): Promise<{ 
  breakdown: { like: number; celebrate: number; support: number; love: number; insightful: number; curious: number };
  reactors: ReactorData[];
}> {
  const breakdown = { like: 0, celebrate: 0, support: 0, love: 0, insightful: 0, curious: 0 };
  const reactors: ReactorData[] = [];
  
  try {
    const encodedUrn = encodeURIComponent(postUrn);
    let start = 0;
    const count = 100;
    let hasMore = true;
    const actorUrns: string[] = [];
    const rawReactors: { urn: string; type: string }[] = [];

    while (hasMore) {
      const reactionsUrl = `https://api.linkedin.com/rest/reactions/(entity:${encodedUrn})?q=entity&start=${start}&count=${count}`;
      
      console.log(`Fetching reactions for ${postUrn} (start=${start})...`);
      
      const response = await fetch(reactionsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'LinkedIn-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const elements = data.elements || [];
        
        // Log first element for debugging URN format
        if (start === 0 && elements.length > 0) {
          console.log('Raw reaction element[0]:', JSON.stringify(elements[0]));
        }

        for (const element of elements) {
          const reactionType = element.reactionType?.toLowerCase();
          if (reactionType && reactionType in breakdown) {
            breakdown[reactionType as keyof typeof breakdown]++;
          }
          
          // Collect actor URN from multiple response shapes
          const actorUrn = extractReactionActorUrn(element);
          if (actorUrn) {
            actorUrns.push(actorUrn);
            rawReactors.push({ urn: actorUrn, type: reactionType || 'like' });
          } else if (start === 0) {
            console.log('Could not extract reaction actor URN from element:', JSON.stringify(element));
          }
        }
        
        hasMore = elements.length === count;
        start += count;
      } else {
        const errorText = await response.text();
        console.log(`Could not fetch reactions: ${response.status} - ${errorText}`);
        hasMore = false;
      }
    }

    console.log(`Collected ${rawReactors.length} reactors, resolving names...`);
    
    // Batch resolve names (limit to first 50 to avoid rate limits)
    const urnsToResolve = actorUrns.slice(0, 50);
    const resolvedNames = await resolveActorNames(accessToken, urnsToResolve);
    
    for (const raw of rawReactors) {
      const info = resolvedNames.get(raw.urn) || { name: 'LinkedIn Member', headline: null, profileUrl: null };
      reactors.push({
        actor_urn: raw.urn,
        actor_name: info.name,
        actor_headline: info.headline,
        actor_profile_url: info.profileUrl,
        reaction_type: raw.type,
      });
    }

    console.log('Reaction breakdown:', breakdown);
  } catch (error) {
    console.error('Error fetching reaction breakdown:', error);
  }
  
  return { breakdown, reactors };
}

// Fetch comments for a post
async function fetchPostComments(
  accessToken: string,
  postUrn: string
): Promise<CommentData[]> {
  const comments: CommentData[] = [];
  
  try {
    const encodedUrn = encodeURIComponent(postUrn);
    let start = 0;
    const count = 50;
    let hasMore = true;
    const actorUrns: string[] = [];
    const rawComments: { urn: string; content: string; commentedAt: string | null; commentUrn: string | null; parentUrn: string | null }[] = [];

    while (hasMore) {
      const commentsUrl = `https://api.linkedin.com/rest/socialActions/${encodedUrn}/comments?start=${start}&count=${count}`;
      
      console.log(`Fetching comments for ${postUrn} (start=${start})...`);
      
      const response = await fetch(commentsUrl, {
        headers: {
          'Authorization': `Bearer ${accessToken}`,
          'LinkedIn-Version': LINKEDIN_VERSION,
          'X-Restli-Protocol-Version': '2.0.0',
        },
      });

      if (response.ok) {
        const data = await response.json();
        const elements = data.elements || [];
        
        for (const element of elements) {
          const actorUrn = element.actor;
          const messageText = element.message?.text || element.message || '';
          const createdTime = element.created?.time ? new Date(element.created.time).toISOString() : null;
          const commentUrn = element['$URN'] || element.commentUrn || null;
          const parentUrn = element.parentComment || null;
          
          // Accept both urn:li:person: and urn:li:member: formats
          let resolvedUrn: string | null = null;
          if (actorUrn && typeof actorUrn === 'string') {
            if (actorUrn.startsWith('urn:li:person:') || actorUrn.startsWith('urn:li:member:')) {
              resolvedUrn = actorUrn;
            }
          } else if (actorUrn && typeof actorUrn === 'object') {
            const nested = (actorUrn as any).actorId || (actorUrn as any)['$URN'] || (actorUrn as any).urn;
            if (nested && typeof nested === 'string' && (nested.startsWith('urn:li:person:') || nested.startsWith('urn:li:member:'))) {
              resolvedUrn = nested;
            }
          }
          
          if (resolvedUrn) {
            actorUrns.push(resolvedUrn);
            rawComments.push({
              urn: resolvedUrn,
              content: typeof messageText === 'string' ? messageText : JSON.stringify(messageText),
              commentedAt: createdTime,
              commentUrn,
              parentUrn,
            });
          }
        }
        
        hasMore = elements.length === count;
        start += count;
      } else {
        const errorText = await response.text();
        console.log(`Could not fetch comments: ${response.status} - ${errorText}`);
        hasMore = false;
      }
    }

    console.log(`Collected ${rawComments.length} comments, resolving names...`);
    
    // Resolve names (limit to 50)
    const urnsToResolve = [...new Set(actorUrns)].slice(0, 50);
    const resolvedNames = await resolveActorNames(accessToken, urnsToResolve);
    
    for (const raw of rawComments) {
      const info = resolvedNames.get(raw.urn) || { name: 'LinkedIn Member', headline: null, profileUrl: null };
      comments.push({
        actor_urn: raw.urn,
        actor_name: info.name,
        actor_headline: info.headline,
        actor_profile_url: info.profileUrl,
        content: raw.content,
        commented_at: raw.commentedAt,
        linkedin_comment_urn: raw.commentUrn,
        parent_comment_urn: raw.parentUrn,
      });
    }
  } catch (error) {
    console.error('Error fetching post comments:', error);
  }
  
  return comments;
}

// Store reactors in database
async function storeReactors(
  supabase: any,
  postId: string,
  reactors: ReactorData[]
): Promise<void> {
  if (reactors.length === 0) return;
  
  try {
    const rows = reactors.map(r => ({
      post_id: postId,
      actor_urn: r.actor_urn,
      actor_name: r.actor_name,
      actor_headline: r.actor_headline,
      actor_profile_url: r.actor_profile_url,
      reaction_type: r.reaction_type,
    }));

    // Upsert in batches of 50
    for (let i = 0; i < rows.length; i += 50) {
      const batch = rows.slice(i, i + 50);
      const { error } = await supabase
        .from('post_reactors')
        .upsert(batch, { onConflict: 'post_id,actor_urn' });

      if (error) {
        console.error('Failed to upsert reactors batch:', error);
      }
    }
    console.log(`Stored ${rows.length} reactors for post ${postId}`);
  } catch (error) {
    console.error('Error storing reactors:', error);
  }
}

// Store comments in database
async function storeComments(
  supabase: any,
  postId: string,
  comments: CommentData[]
): Promise<void> {
  if (comments.length === 0) return;
  
  try {
    const rows = comments.map(c => ({
      post_id: postId,
      author_urn: c.actor_urn,
      author_name: c.actor_name,
      author_headline: c.actor_headline,
      author_profile_url: c.actor_profile_url,
      content: c.content,
      commented_at: c.commented_at,
      linkedin_comment_urn: c.linkedin_comment_urn,
    }));

    // Upsert by linkedin_comment_urn if available, otherwise insert
    for (const row of rows) {
      if (row.linkedin_comment_urn) {
        const { error } = await supabase
          .from('post_comments')
          .upsert(row, { onConflict: 'linkedin_comment_urn' });
        if (error) {
          // Fallback: try insert ignoring conflict
          await supabase.from('post_comments').insert(row);
        }
      } else {
        await supabase.from('post_comments').insert(row);
      }
    }
    console.log(`Stored ${rows.length} comments for post ${postId}`);
  } catch (error) {
    console.error('Error storing comments:', error);
  }
}

// Fetch analytics for a single post URN
async function fetchPostAnalytics(
  accessToken: string,
  postUrn: string
): Promise<PostAnalytics & { reactors: ReactorData[] }> {
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
  let reactors: ReactorData[] = [];

  const isUgcPost = postUrn.includes('ugcPost');
  const isShare = postUrn.includes('share');
  
  if (!isUgcPost && !isShare) {
    console.log(`Unknown URN format: ${postUrn}, skipping analytics`);
    return { ...analytics, reactors };
  }

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
          case 'IMPRESSION': analytics.impressions = count; break;
          case 'MEMBERS_REACHED': analytics.uniqueImpressions = count; break;
          case 'REACTION': analytics.reactions = count; break;
          case 'COMMENT': analytics.comments = count; break;
          case 'RESHARE': analytics.reshares = count; break;
        }
        console.log(`${metric}: ${count}`);
      } else {
        const errorText = await response.text();
        console.log(`Could not fetch ${metric}: ${response.status} - ${errorText}`);
      }
    } catch (metricError) {
      console.error(`Error fetching ${metric}:`, metricError);
    }
  }

  // Fetch reaction breakdown AND reactor identities
  if (analytics.reactions > 0) {
    const { breakdown, reactors: fetchedReactors } = await fetchReactionBreakdown(accessToken, postUrn);
    analytics.reactionLike = breakdown.like;
    analytics.reactionCelebrate = breakdown.celebrate;
    analytics.reactionSupport = breakdown.support;
    analytics.reactionLove = breakdown.love;
    analytics.reactionInsightful = breakdown.insightful;
    analytics.reactionCurious = breakdown.curious;
    reactors = fetchedReactors;
  }

  return { ...analytics, reactors };
}

// Save analytics snapshot for trend tracking
async function saveAnalyticsSnapshot(
  supabase: any,
  postId: string,
  analytics: PostAnalytics
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  
  try {
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

// Fetch follower history
async function fetchFollowerHistory(
  accessToken: string,
  publisherId: string,
  supabase: any
): Promise<number> {
  let latestCount = 0;

  try {
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 90);

    const dateRangeParam = `(start:(year:${startDate.getFullYear()},month:${startDate.getMonth() + 1},day:${startDate.getDate()}),end:(year:${endDate.getFullYear()},month:${endDate.getMonth() + 1},day:${endDate.getDate()}))`;
    const url = `https://api.linkedin.com/rest/memberFollowersCount?q=dateRange&dateRange=${dateRangeParam}`;

    console.log(`Fetching follower history for publisher ${publisherId}...`);

    const response = await fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'LinkedIn-Version': LINKEDIN_VERSION,
        'X-Restli-Protocol-Version': '2.0.0',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`Failed to fetch follower history: ${response.status} - ${errorText}`);
      return latestCount;
    }

    const data = await response.json();
    const elements = data.elements || [];

    if (elements.length === 0) return latestCount;

    const upsertRows = [];
    for (const element of elements) {
      const count = element.memberFollowersCount ?? element.followerCount ?? 0;
      const dateRange = element.dateRange;

      if (!dateRange?.start) continue;

      const { year, month, day } = dateRange.start;
      const snapshotDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

      upsertRows.push({
        publisher_id: publisherId,
        snapshot_date: snapshotDate,
        follower_count: count,
      });

      if (count > latestCount) latestCount = count;
    }

    if (upsertRows.length > 0) {
      const { error } = await supabase
        .from('follower_history')
        .upsert(upsertRows, { onConflict: 'publisher_id,snapshot_date' });

      if (error) console.error('Failed to upsert follower history:', error);
      else console.log(`Upserted ${upsertRows.length} follower history rows`);
    }
  } catch (error) {
    console.error('Error fetching follower history:', error);
  }

  return latestCount;
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

    const { data: publisher, error: publisherError } = await supabase
      .from('publishers')
      .select('id, name, workspace_id, linkedin_member_id, linkedin_access_token, linkedin_refresh_token, linkedin_token_expires_at')
      .eq('id', publisherId)
      .single();

    if (publisherError || !publisher) {
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

    const { data: appPosts, error: postsError } = await supabase
      .from('posts')
      .select('id, linkedin_post_urn, publisher_name, content, published_at')
      .eq('publisher_name', publisher.name)
      .eq('publish_method', 'linkedin_api')
      .not('linkedin_post_urn', 'is', null)
      .order('published_at', { ascending: false });

    if (postsError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch app-published posts' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!appPosts || appPosts.length === 0) {
      return new Response(
        JSON.stringify({ success: true, syncedCount: 0, message: 'No app-published posts found' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${appPosts.length} app-published posts to fetch analytics for`);

    let syncedCount = 0;
    for (const post of appPosts) {
      try {
        const analyticsWithReactors = await fetchPostAnalytics(accessToken, post.linkedin_post_urn);
        const { reactors, ...analytics } = analyticsWithReactors;
        
        const totalEngagements = analytics.reactions + analytics.comments + analytics.reshares;
        const engagementRate = analytics.impressions > 0 
          ? parseFloat(((totalEngagements / analytics.impressions) * 100).toFixed(2))
          : null;

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
          console.log(`Updated analytics for post ${post.id}`);
          
          await saveAnalyticsSnapshot(supabase, post.id, analytics);
          
          // Store reactors
          await storeReactors(supabase, post.id, reactors);
          
          // Fetch and store comments
          const postComments = await fetchPostComments(accessToken, post.linkedin_post_urn);
          await storeComments(supabase, post.id, postComments);
        }
      } catch (error) {
        console.error(`Error processing post ${post.id}:`, error);
      }
    }

    console.log(`Successfully synced analytics for ${syncedCount} posts`);

    // Fetch follower history for legacy workspace
    let followerCount = null;
    if (publisher.workspace_id === LEGACY_WORKSPACE_ID) {
      try {
        followerCount = await fetchFollowerHistory(accessToken, publisher.id, supabase);
        if (followerCount > 0) {
          await supabase
            .from('publishers')
            .update({
              followers_count: followerCount,
              profile_analytics_fetched_at: new Date().toISOString(),
            })
            .eq('id', publisher.id);
        }
      } catch (followerError) {
        console.error('Error fetching follower history:', followerError);
      }
    }

    return new Response(
      JSON.stringify({ success: true, syncedCount, followerCount, message: `Synced analytics for ${syncedCount} posts` }),
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
