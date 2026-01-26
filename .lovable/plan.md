
# Plan: Add MEMBERS_REACHED (Unique Impressions) Metric

## Overview

Add the `MEMBERS_REACHED` metric from LinkedIn's `memberCreatorPostAnalytics` API to track how many unique people saw each post. This metric differs from impressions in that it counts unique viewers rather than total views.

## Changes Required

### 1. Database Migration

Add a new column to store the unique reach count:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `unique_impressions` | integer | 0 | Unique people who saw the post |

### 2. Edge Function Update

**File: `supabase/functions/fetch-linkedin-posts/index.ts`**

Changes:
- Add `uniqueImpressions` field to `PostAnalytics` interface (line 32-37)
- Add `'MEMBERS_REACHED'` to the metrics array (line 123)
- Add case for `MEMBERS_REACHED` in the switch statement (line 143-156)
- Include `unique_impressions` in the database update (line 258-267)

### 3. Frontend Hook Update

**File: `src/hooks/useLinkedInPosts.tsx`**

Changes:
- Add `unique_impressions: number | null` to `AppPublishedPost` interface (line 5-18)
- Add `unique_impressions` to the select query (line 31)
- Add `totalUniqueImpressions` to stats calculation (line 77-85)

### 4. UI Component Updates

**File: `src/components/LinkedInPostsPanel.tsx`**

Changes:
- Import `Users` icon from lucide-react (line 1)
- Add unique impressions display in `PostCard` metrics row (line 25-52), showing alongside regular impressions with a Users icon
- Add "Unique Reach" stat to `StatsOverview` component (line 79-98), expanding to a 3-column grid

## UI Design

### Post Card Metrics Row (Updated)
```text
[Eye] 18  [Users] 12  [Heart] 1  [MessageCircle] 0  [Share2] 0  [TrendingUp] 5.6%
  ^         ^
  |         └── NEW: Unique impressions (MEMBERS_REACHED)
  └── Total impressions
```

### Stats Overview Grid (Updated to 3x2 layout)
```text
+--------+--------+--------+
| Posts  | Reach  | Impr.  |
|   1    |   12   |   18   |
+--------+--------+--------+
| React. | Comm.  | Reshare|
|   1    |   0    |   0    |
+--------+--------+--------+
```

## Implementation Details

### LinkedIn API Call
The `MEMBERS_REACHED` metric uses the same API endpoint as other metrics:

```
GET /rest/memberCreatorPostAnalytics
  ?q=entity
  &entity=(share:urn:li:share:123)
  &queryType=MEMBERS_REACHED
  &aggregation=TOTAL
```

### Files to Modify

| File | Type of Change |
|------|----------------|
| Database migration | Add `unique_impressions` column |
| `supabase/functions/fetch-linkedin-posts/index.ts` | Fetch MEMBERS_REACHED metric |
| `src/hooks/useLinkedInPosts.tsx` | Add field to interface and stats |
| `src/components/LinkedInPostsPanel.tsx` | Display unique reach in UI |

## Benefits

1. **Unique vs Total Views** - See how many individual people saw the post vs repeat views
2. **Better Reach Understanding** - Understand true audience reach
3. **Engagement Context** - Compare reactions to unique viewers for better engagement analysis
