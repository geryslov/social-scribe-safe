

# Plan: Fetch Analytics for App-Published Posts Only

## Problem Analysis

The current implementation tries to fetch ALL LinkedIn posts using the `/rest/posts` endpoint, which requires the `r_member_social` scope (part of Community Management API) that is not available for your application.

However, your app already stores the LinkedIn post URN when it publishes a post. We can use this URN with the `r_member_postAnalytics` scope (which you DO have) to fetch analytics for those specific posts.

## Solution Overview

Instead of trying to read all posts from LinkedIn, we will:
1. Look at posts in your database that were published via the app
2. Extract the LinkedIn URN from each post
3. Use the `memberCreatorPostAnalytics` API to fetch metrics for those specific posts
4. Display the analytics alongside your app's posts

This approach:
- Uses only the `r_member_postAnalytics` scope (already authorized)
- Tracks only posts published through your app (which is what you wanted)
- Provides full analytics: impressions, reactions, comments, reshares

## Implementation Steps

### Step 1: Update Database Schema
Add a `linkedin_post_urn` column to the `posts` table to store the raw URN separately from the URL for easier querying.

```text
posts table changes:
+---------------------+------+
| linkedin_post_urn   | text |  <- NEW: stores raw URN like "urn:li:share:123"
+---------------------+------+
| impressions         | int  |  <- NEW: cached analytics
| reactions           | int  |  <- NEW: cached analytics
| comments            | int  |  <- NEW: cached analytics
| reshares            | int  |  <- NEW: cached analytics
| engagement_rate     | num  |  <- NEW: calculated rate
| analytics_fetched_at| ts   |  <- NEW: last sync time
+---------------------+------+
```

### Step 2: Update linkedin-post Edge Function
When publishing a post, store the raw URN in the new `linkedin_post_urn` column.

### Step 3: Rewrite fetch-linkedin-posts Edge Function
Change the approach to:
1. Query the `posts` table for app-published posts with LinkedIn URNs
2. Use `memberCreatorPostAnalytics` API to fetch metrics for each URN
3. Update the `posts` table with the fetched analytics

### Step 4: Update Frontend Hook
Modify `useLinkedInPosts` to:
- Query posts from the `posts` table (not the separate `linkedin_posts` table)
- Show analytics for posts published via the app

### Step 5: Update LinkedInPostsPanel Component
Update the UI to display analytics for app-published posts, with a sync button to refresh metrics.

## Technical Details

### API Used: memberCreatorPostAnalytics
This API works with the `r_member_postAnalytics` scope you already have:

```
GET /rest/memberCreatorPostAnalytics
  ?q=entity
  &entity=(share:urn:li:share:123)
  &queryType=IMPRESSION
  &aggregation=TOTAL
```

Metrics available:
- IMPRESSION - Number of times the post was shown
- REACTION - Likes and other reactions
- COMMENT - Number of comments
- RESHARE - Number of shares

### Data Flow

```text
1. User publishes post via app
   └─> linkedin-post function
       └─> Stores URN in posts.linkedin_post_urn

2. User clicks "Sync Analytics"
   └─> fetch-linkedin-posts function
       ├─> Queries posts with linkedin_post_urn
       ├─> Calls memberCreatorPostAnalytics API for each
       └─> Updates posts table with metrics

3. UI displays analytics from posts table
```

## Files to Modify

| File | Changes |
|------|---------|
| Database migration | Add analytics columns to posts table |
| `supabase/functions/linkedin-post/index.ts` | Store raw URN in new column |
| `supabase/functions/fetch-linkedin-posts/index.ts` | Complete rewrite to fetch analytics for app posts only |
| `src/hooks/useLinkedInPosts.tsx` | Query posts table instead of linkedin_posts |
| `src/components/LinkedInPostsPanel.tsx` | Update to show app-published posts with analytics |

## Benefits

1. **Works with your current scopes** - No additional LinkedIn permissions needed
2. **Focused on app posts** - Only tracks what you published through the app
3. **Simpler architecture** - Uses existing posts table instead of separate sync table
4. **Full analytics** - Impressions, reactions, comments, reshares, engagement rate

