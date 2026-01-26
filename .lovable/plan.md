
# Plan: Remove App-Published Posts Section & Show Inline Analytics Per Post

## Overview

Remove the separate "App-Published Posts" panel from the publisher view and ensure each published post displays an inline analytics summary directly in the post row. This streamlines the UI by showing metrics where they're contextually relevant.

## Current State

1. **LinkedInPostsPanel** (`src/components/LinkedInPostsPanel.tsx`) is rendered on the Posts page when a publisher is selected (lines 310-318 in `Posts.tsx`)
2. **PostRow** already has inline analytics display code (lines 260-300), but it only shows when:
   - `post.status === 'done'` AND
   - `post.publishMethod === 'linkedin_api'`
3. The **usePosts hook** does NOT fetch analytics columns from the database - it only selects `*` but the mapping function ignores analytics fields

## Problems Identified

1. The `usePosts` hook fetches posts but doesn't include analytics fields in the returned `Post` object
2. The `PostRow` component has analytics display logic but it's conditional on `publishMethod === 'linkedin_api'` only
3. Analytics data exists in the database but isn't being passed through to the UI

## Proposed Changes

### 1. Update usePosts Hook

Modify `src/hooks/usePosts.tsx` to include analytics columns in the mapping:

**Add to DbPost type:**
- `impressions: number | null`
- `unique_impressions: number | null`  
- `reactions: number | null`
- `comments_count: number | null`
- `reshares: number | null`
- `engagement_rate: number | null`
- `analytics_fetched_at: string | null`

**Update mapDbToPost function** to include these fields in the returned Post object.

### 2. Update Post Type

Modify `src/types/post.ts` to include analytics fields:

```
impressions?: number | null;
unique_impressions?: number | null;
reactions?: number | null;
comments_count?: number | null;
reshares?: number | null;
engagement_rate?: number | null;
```

### 3. Update PostRow Component

Modify `src/components/PostRow.tsx` to:
- Show analytics for ALL published posts (status === 'done'), not just API-published ones
- Show analytics even when all values are zero (with a "No analytics yet" message)
- Remove the `publishMethod === 'linkedin_api'` condition

### 4. Remove LinkedInPostsPanel from Posts Page

Modify `src/pages/Posts.tsx`:
- Remove the import for `LinkedInPostsPanel`
- Remove the conditional render block (lines 309-318)

## Files to Modify

| File | Action | Description |
|------|--------|-------------|
| `src/types/post.ts` | Modify | Add analytics fields to Post interface |
| `src/hooks/usePosts.tsx` | Modify | Include analytics columns in query and mapping |
| `src/components/PostRow.tsx` | Modify | Show analytics for all published posts, improve display |
| `src/pages/Posts.tsx` | Modify | Remove LinkedInPostsPanel import and render |

## Implementation Details

### Post Type Updates

```text
// Add to src/types/post.ts
export interface Post {
  // ... existing fields ...
  
  // Analytics fields
  impressions?: number | null;
  unique_impressions?: number | null;
  reactions?: number | null;
  comments_count?: number | null;
  reshares?: number | null;
  engagement_rate?: number | null;
}
```

### usePosts Hook Updates

```text
// Add to DbPost type
type DbPost = {
  // ... existing fields ...
  impressions: number | null;
  unique_impressions: number | null;
  reactions: number | null;
  comments_count: number | null;
  reshares: number | null;
  engagement_rate: number | null;
  analytics_fetched_at: string | null;
};

// Update mapDbToPost
function mapDbToPost(dbPost: DbPost): Post {
  return {
    // ... existing mappings ...
    impressions: dbPost.impressions,
    unique_impressions: dbPost.unique_impressions,
    reactions: dbPost.reactions,
    comments_count: dbPost.comments_count,
    reshares: dbPost.reshares,
    engagement_rate: dbPost.engagement_rate,
  };
}
```

### PostRow Updates

```text
// Change the condition from:
{post.status === 'done' && post.publishMethod === 'linkedin_api' && (...)}

// To:
{post.status === 'done' && (...)}

// And show all metrics (even zeros) with better formatting
```

### Posts.tsx Updates

```text
// Remove:
import { LinkedInPostsPanel } from '@/components/LinkedInPostsPanel';

// Remove lines 309-318:
{currentDbPublisher && (
  <div className="mb-8">
    <LinkedInPostsPanel ... />
  </div>
)}
```

## Visual Result

Each published post will now show inline analytics directly in the post card:

```text
+--------------------------------------------------+
| [Avatar] Publisher Name                           |
|                                                   |
| Post content here...                              |
|                                                   |
| [Published] Jan 15  [LinkedIn] View on LinkedIn   |
|                                                   |
| ─────────────────────────────────────────────────│
| 👁 1,234  👤 892  ❤️ 45  💬 12  🔄 8  📈 3.2%     |
+--------------------------------------------------+
```

## Benefits

1. **Cleaner UI**: No separate panel taking up space
2. **Contextual Data**: Analytics shown where they're most relevant (with the post)
3. **Consistent Experience**: All published posts show analytics, not just API-published ones
4. **Better Scannability**: Users can quickly compare post performance while scrolling
