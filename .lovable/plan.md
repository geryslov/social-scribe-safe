

# LinkedIn Profile Analytics (Legacy Data Workspace Only)

## Overview
Add LinkedIn profile analytics (profile viewers, followers count, search appearances) but restrict the feature to only display and fetch for publishers in the **Legacy Data** workspace. Other workspaces will not see or trigger this feature.

## Changes

### 1. Database Migration
Add new columns to the `publishers` table to store profile analytics data:
- `profile_viewers` (integer, default 0)
- `followers_count` (integer, default 0)
- `search_appearances` (integer, default 0)
- `profile_analytics_fetched_at` (timestamptz, nullable)

### 2. OAuth Scope Update
**File: `supabase/functions/linkedin-auth/index.ts`**
- Add `r_member_profileAnalytics` to the scopes array in the SSO flow (lines 75-82) so that new logins grant permission for profile analytics
- Existing users will need to re-authenticate to gain the new scope

### 3. Edge Function: Fetch Profile Analytics
**File: `supabase/functions/fetch-linkedin-posts/index.ts`**
- Add a new `fetchProfileAnalytics` function that calls:
  - `GET /rest/memberFollowersCount?q=me`
  - `GET /rest/memberProfileViewersCount?q=me`
  - `GET /rest/memberSearchAppearancesCount?q=me`
- In the main handler, **after** fetching post analytics, check if the publisher belongs to the Legacy Data workspace (`f26b7a85-d4ad-451e-8585-d9906d5b9f95`)
- Only call `fetchProfileAnalytics` if the publisher's `workspace_id` matches the Legacy Data workspace
- Update the publisher record with the fetched values

### 4. Update Publisher Interface
**File: `src/hooks/usePublishers.tsx`**
- Add the four new fields to the `Publisher` interface: `profile_viewers`, `followers_count`, `search_appearances`, `profile_analytics_fetched_at`

### 5. Display Profile Insights (Legacy Data Only)
**File: `src/pages/PublisherAnalytics.tsx`**
- Import `useWorkspace` to get the current workspace context
- Add a "Profile Insights" section with three stat cards (Profile Viewers, Followers, Search Appearances) using the existing CyberCard + CountUp components
- **Only render this section** when the current workspace ID matches the Legacy Data workspace ID
- Uses Eye, Users, and Search icons from lucide-react

### 6. Show Follower Count in Analytics Rankings (Legacy Data Only)
**File: `src/pages/Analytics.tsx`**
- Import `useWorkspace` to check the current workspace
- In the Publisher Rankings section, show the follower count next to reach info -- only when viewing the Legacy Data workspace

### 7. Auto-Sync Integration
**File: `src/hooks/useAutoSync.tsx`**
- No changes needed -- the existing auto-sync already calls `fetch-linkedin-posts` for each connected publisher, and the edge function itself will conditionally fetch profile analytics based on the workspace check

## Technical Details

### Workspace Scoping Logic
The Legacy Data workspace check happens in two places:
1. **Backend** (edge function): The publisher's `workspace_id` is queried from the database; profile analytics are only fetched if it matches the Legacy Data workspace UUID
2. **Frontend** (UI pages): The `currentWorkspace.id` is compared against the Legacy Data workspace UUID to conditionally render the Profile Insights section

### LinkedIn API Calls
All three endpoints use:
- `Authorization: Bearer {token}`
- `LinkedIn-Version: 202601`
- `X-Restli-Protocol-Version: 2.0.0`

Each call is wrapped in try/catch so if any endpoint fails (e.g., scope not granted), it gracefully falls back to 0 without breaking the rest of the sync.

### Constant for Workspace ID
A constant `LEGACY_WORKSPACE_ID` will be defined in the edge function and a matching one on the frontend to keep things maintainable and avoid magic strings scattered across the code.
