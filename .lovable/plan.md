

# Plan: Replace Posts Page Stats with Aggregated Analytics

## Overview

Replace the current summary stats on the Posts page (Publishers, Total Posts, Published, Unpublished) with aggregated analytics data from all posts, providing immediate insight into overall performance.

## Current State

The Posts page (`/posts`) currently shows:
- Publishers count
- Total Posts count
- Published count
- Unpublished count

These are basic counts that don't provide performance insights.

## Proposed Changes

Replace with analytics-focused stats:
- **Total Reach** - Sum of unique impressions across all published posts
- **Impressions** - Sum of all impressions
- **Reactions** - Total reactions (likes, celebrates, etc.)
- **Avg Engagement** - Average engagement rate percentage

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/pages/Posts.tsx` | Modify | Import useAnalytics hook, replace globalStats with analytics stats, update stat cards |

## Implementation Details

### 1. Add useAnalytics Hook Import

Import the existing `useAnalytics` hook which already provides aggregated stats.

### 2. Replace Stats Cards

Replace the current 4 cards:

**Current:**
```text
[Users] Publishers    [FileText] Total Posts
[CheckCircle] Published    [Clock] Unpublished
```

**New:**
```text
[Users] Total Reach    [Eye] Impressions
[Heart] Reactions    [TrendingUp] Avg Engagement %
```

### 3. Use useAnalytics Hook

Call the hook with no publisher filter to get global stats:
```text
const { stats, isLoading: analyticsLoading } = useAnalytics(null, '30d');
```

### 4. Update Card Display

- Use the stats object from useAnalytics: `stats.totalReach`, `stats.totalImpressions`, `stats.totalReactions`, `stats.avgEngagementRate`
- Format numbers with `toLocaleString()` for readability
- Add percentage suffix for engagement rate

## Visual Preview

```text
+-------------------+  +-------------------+
|  [Users]          |  |  [Eye]            |
|  12,450           |  |  24,800           |
|  Total Reach      |  |  Impressions      |
+-------------------+  +-------------------+

+-------------------+  +-------------------+
|  [Heart]          |  |  [TrendingUp]     |
|  892              |  |  4.2%             |
|  Reactions        |  |  Avg Engagement   |
+-------------------+  +-------------------+
```

## Technical Notes

- The `useAnalytics` hook is already implemented and tested on the Analytics page
- No database changes required
- Stats will automatically update when posts are synced
- Shows data from all published posts (status = 'done')

