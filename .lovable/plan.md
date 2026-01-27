
# Plan: LinkedIn-Style Post Card UI

## Overview

This plan creates a new component that displays posts exactly like they appear on LinkedIn - with the author's profile picture, name, role, published date, post content, and a familiar engagement bar showing likes, comments, shares, and impressions.

---

## Visual Design

```text
+------------------------------------------------------------------------+
|                                                                         |
|  [PROFILE IMAGE]  Publisher Name                            • 3h ago   |
|                   Role/Title                                            |
|                   👤 1st · [LinkedIn icon]                              |
|                                                                         |
+------------------------------------------------------------------------+
|                                                                         |
|  Post content goes here. This is the main text of the post that        |
|  can span multiple lines and include hashtags like #leadership          |
|  and mentions. The text wraps naturally and shows the full content     |
|  or truncates with "...more" for long posts.                           |
|                                                                         |
|                               ...more                                   |
|                                                                         |
+------------------------------------------------------------------------+
|                                                                         |
|  👍 💡 ❤️  156  ·  24 comments  ·  8 reposts                            |
|                                                                         |
+------------------------------------------------------------------------+
|                                                                         |
|  [👍 Like]     [💬 Comment]     [🔄 Repost]     [📤 Send]              |
|                                                                         |
+------------------------------------------------------------------------+
|                                                                         |
|  📊 ANALYTICS                                                           |
|  ┌─────────────┬─────────────┬─────────────┬─────────────┐             |
|  │ 👁 1,234    │ 👤 892      │ 📈 2.4%     │ 🔗 View     │             |
|  │ Impressions │ Reach       │ Engagement  │ on LinkedIn │             |
|  └─────────────┴─────────────┴─────────────┴─────────────┘             |
|                                                                         |
+------------------------------------------------------------------------+
```

---

## Implementation Details

### 1. New Component: LinkedInPostCard

Create a new reusable component that mimics LinkedIn's post format:

**Key Features:**
- Profile picture (circular, like LinkedIn)
- Author name and role/headline
- Time since published ("3h ago", "2d ago", etc.)
- Full post content with "...more" expansion
- Reaction icons row showing top reaction types
- Engagement summary (likes, comments, reposts)
- Action buttons row (matching LinkedIn's style)
- Analytics panel below (your custom addition)

**Location:** `src/components/LinkedInPostCard.tsx`

### 2. Component Structure

```typescript
interface LinkedInPostCardProps {
  post: Post;
  showAnalytics?: boolean;  // Toggle analytics panel
  variant?: 'feed' | 'detail';  // Feed = compact, Detail = expanded
  onViewOnLinkedIn?: () => void;
}
```

### 3. Sub-Components

| Component | Purpose |
|-----------|---------|
| `PostHeader` | Avatar, name, role, timestamp, LinkedIn badge |
| `PostContent` | Text with "...more" truncation |
| `ReactionSummary` | 👍💡❤️ icons + count |
| `EngagementBar` | Comments · Reposts counts |
| `ActionButtons` | Like, Comment, Repost, Send buttons |
| `AnalyticsPanel` | Impressions, Reach, Engagement rate |

### 4. Time Formatting

LinkedIn-style relative time display:
- Under 1 hour: "45m ago"
- Under 24 hours: "3h ago"
- Under 7 days: "2d ago"
- Under 30 days: "2w ago"
- Older: "Jan 15, 2026"

### 5. Reaction Icons Display

Show top 3 reaction types as small icons:
- If mostly likes: 👍
- Mix of reactions: 👍💡❤️
- Uses data from `reactionBreakdown` field

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `src/components/LinkedInPostCard.tsx` | **NEW** | Main card component |
| `src/components/LinkedInPostCard.css` | **NEW** | LinkedIn-specific styles |
| `src/lib/timeUtils.ts` | **NEW** | Relative time formatting |
| `src/pages/Analytics.tsx` | Modify | Option to show posts as cards |
| `src/pages/Posts.tsx` | Modify | Add toggle between row/card view |

---

## Styling Approach

The component will blend LinkedIn's familiar design with your existing techy theme:

**LinkedIn-Authentic Elements:**
- Circular profile photos
- Standard LinkedIn font weights and spacing
- Familiar action button layout
- Reaction icon stacking

**Your Techy Theme Additions:**
- Glowing borders on hover
- CyberCard styling for analytics panel
- Monospace fonts for numbers
- Animated CountUp for metrics

---

## Usage Locations

### Option A: New "Feed View" on Posts Page

Add a toggle button to switch between:
- **List View** (current PostRow)
- **Feed View** (new LinkedInPostCard)

```text
[All Posts]                    [List ▼] [Feed ▣]
```

### Option B: Replace TopPostsLeaderboard

Use LinkedInPostCard in the Analytics dashboard to show top performing posts in LinkedIn format instead of the current condensed list.

### Option C: New Dedicated Feed Page

Create `/feed` route showing all published posts in LinkedIn card format with infinite scroll.

---

## Technical Details

### Relative Time Helper

```typescript
// src/lib/timeUtils.ts
export function getRelativeTime(date: Date): string {
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  const diffWeeks = Math.floor(diffDays / 7);
  
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  if (diffWeeks < 4) return `${diffWeeks}w`;
  return format(date, 'MMM d, yyyy');
}
```

### Reaction Icons Stack

Display up to 3 reaction type icons based on which reactions the post received:

```typescript
const getTopReactions = (breakdown: ReactionBreakdown) => {
  return Object.entries(breakdown)
    .filter(([_, count]) => count > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([type]) => type);
};
```

---

## Summary

This implementation creates an authentic LinkedIn-style post card that:

1. **Looks familiar** - Users immediately recognize the LinkedIn format
2. **Shows rich data** - Profile photo, name, role, content, reactions
3. **Adds value** - Includes analytics panel with impressions, reach, engagement
4. **Fits your theme** - Blends LinkedIn's design with your techy aesthetic
5. **Is flexible** - Can be used on Posts page, Analytics, or a new Feed page

The component will make your analytics dashboard feel more connected to the actual LinkedIn experience while providing the detailed metrics that matter.
