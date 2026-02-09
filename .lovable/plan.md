

# Follower Growth Tracking (Legacy Data Workspace Only)

## Overview
Since LinkedIn doesn't expose follower demographics for personal profiles, we'll implement **follower growth tracking over time** using the `memberFollowersCount` time-bound API. This will store daily follower snapshots and display a growth chart showing how followers change day by day.

## What the LinkedIn API Provides

The `memberFollowersCount` endpoint with `q=dateRange` returns daily follower counts:

```text
GET /rest/memberFollowersCount?q=dateRange&dateRange=(start:(year:2026,month:1,day:1),end:(year:2026,month:2,day:8))
```

Response:
```text
{
  "elements": [
    { "memberFollowersCount": 102, "dateRange": { "start": {...}, "end": {...} } },
    { "memberFollowersCount": 105, "dateRange": { "start": {...}, "end": {...} } },
    ...
  ]
}
```

## Implementation Steps

### 1. Database: New `follower_history` Table
Create a table to store daily follower snapshots per publisher:

- `id` (uuid, primary key)
- `publisher_id` (uuid, references publishers)
- `snapshot_date` (date)
- `follower_count` (integer)
- `created_at` (timestamptz)
- Unique constraint on `(publisher_id, snapshot_date)` for upserts

RLS policies: Allow select/insert/update for authenticated users (same pattern as `post_analytics_history`).

### 2. Edge Function: Extend `fetch-linkedin-posts`
Add a new `fetchFollowerHistory` function that:

- Calls `GET /rest/memberFollowersCount?q=dateRange` with a 90-day lookback window
- Parses the daily counts from the response
- Upserts each day's count into the `follower_history` table
- Only runs for Legacy Data workspace publishers (same gating as profile analytics)

This replaces the current broken `memberFollowersCount?q=me` call (which returns 403) with the time-bound variant that should work with the `r_member_profileAnalytics` scope.

Also update the lifetime follower count: extract the most recent day's count from the time-bound response and store it in `publishers.followers_count`.

### 3. Frontend: Follower Growth Chart Component
Create a new `FollowerGrowthChart` component that:

- Queries the `follower_history` table for the selected publisher
- Displays an area chart (using Recharts, matching existing `PerformanceChart` style) showing follower count over time
- Shows key stats: current followers, net change in period, average daily gain
- Supports the same 7d/30d/90d time range toggles

### 4. Update Publisher Analytics Page
On `PublisherAnalytics.tsx`, within the Legacy Data workspace section:

- Replace the current "Profile Insights" static cards with a richer section
- Keep the followers count card but update it to show the latest value from the growth data
- Add the Follower Growth Chart below the profile insights cards
- Remove the Profile Viewers and Search Appearances cards (those APIs don't work)

## Technical Details

### Edge Function Changes (`fetch-linkedin-posts/index.ts`)

New function:
```text
async function fetchFollowerHistory(accessToken, publisherId, supabase):
  - Calculate start date (90 days ago)
  - Call: GET /rest/memberFollowersCount?q=dateRange&dateRange=(start:(...),end:(...))
  - For each element in response:
    - Upsert into follower_history (publisher_id, snapshot_date, follower_count)
  - Return the latest follower count
```

The existing `fetchProfileAnalytics` function will be simplified:
- Remove the broken `memberFollowersCount?q=me`, `memberProfileViewersCount`, and `memberSearchAppearancesCount` calls
- Replace with the `fetchFollowerHistory` call that gets both historical data and current count

### Database Migration
```text
CREATE TABLE follower_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  publisher_id uuid NOT NULL,
  snapshot_date date NOT NULL,
  follower_count integer NOT NULL DEFAULT 0,
  created_at timestamptz DEFAULT now(),
  UNIQUE(publisher_id, snapshot_date)
);

-- RLS
ALTER TABLE follower_history ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can view follower history" ON follower_history FOR SELECT USING (true);
CREATE POLICY "Anyone can insert follower history" ON follower_history FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update follower history" ON follower_history FOR UPDATE USING (true);
```

### Frontend Query Hook
Add a `useFollowerHistory` hook (or extend existing hooks) that:
- Fetches from `follower_history` table filtered by publisher_id
- Orders by snapshot_date ascending
- Computes derived stats (net change, daily average gain)

### UI Changes to `PublisherAnalytics.tsx`
- Remove Profile Viewers and Search Appearances cards
- Keep Followers card, update to show latest from history data
- Add a new card showing follower net change (e.g., "+47 this month")
- Add FollowerGrowthChart below, styled consistently with the existing PerformanceChart

## Files to Create/Modify

1. **New migration**: Create `follower_history` table
2. **`supabase/functions/fetch-linkedin-posts/index.ts`**: Add `fetchFollowerHistory`, replace broken profile analytics calls
3. **`src/components/FollowerGrowthChart.tsx`** (new): Area chart component for follower trends
4. **`src/pages/PublisherAnalytics.tsx`**: Replace Profile Insights section with follower growth chart and updated cards

