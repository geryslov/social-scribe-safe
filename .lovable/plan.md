

# Plan: Enhanced LinkedIn Analytics Implementation

## Overview

This plan details where and how to implement the additional LinkedIn metrics you can retrieve, organized by metric category and mapped to your existing UI structure.

---

## Current Architecture Summary

| Layer | Component | Current State |
|-------|-----------|---------------|
| **Data Storage** | `posts` table | Has: impressions, unique_impressions, reactions, comments_count, reshares, engagement_rate |
| **Edge Function** | `fetch-linkedin-posts` | Fetches 5 metrics: IMPRESSION, MEMBERS_REACHED, REACTION, COMMENT, RESHARE |
| **Post Display** | `PostRow.tsx` | Shows inline analytics for published posts |
| **Analytics Dashboard** | `Analytics.tsx` | Global stats + charts + publisher rankings |
| **Publisher Analytics** | `PublisherAnalytics.tsx` | Per-publisher stats + charts + top posts |

---

## New Metrics Implementation Plan

### 1. Post Metadata (Already Partially Available)

**What you can track:**
- Post text (already stored)
- Creation time (already stored as `published_at`)
- Author (stored as `publisher_name`)
- Post type (text, image, video, link) - **NEW**
- Media assets (image/video URNs) - **NEW**
- Permalink (already stored as `linkedin_post_url`)

**Where to display:**

```text
PostRow.tsx - Add post type indicator
+--------------------------------------------------+
| [Avatar] Publisher Name                           |
| [📝 TEXT] or [🖼️ IMAGE] or [🎬 VIDEO] or [🔗 LINK]  |
|                                                   |
| Post content here...                              |
+--------------------------------------------------+
```

**Database Changes:**
```sql
ALTER TABLE posts ADD COLUMN post_type TEXT; -- 'text', 'image', 'video', 'link', 'document'
ALTER TABLE posts ADD COLUMN media_urns TEXT[]; -- Array of media asset URNs
```

**Visual Design:**
- Small badge next to publisher name showing post type
- Icons: FileText (text), Image (image), Video (video), Link2 (link)
- Color-coded: text=muted, image=blue, video=purple, link=green

---

### 2. Reaction Breakdown

**What you can track:**
- LIKE, CELEBRATE, SUPPORT, LOVE, INSIGHTFUL, CURIOUS counts
- Who reacted (member URNs)

**Where to display:**

**Option A: PostRow.tsx - Hover tooltip on reactions count**
```text
Hover over [❤️ 45] shows:
+---------------------------+
| 👍 LIKE        28 (62%)   |
| 🎉 CELEBRATE   10 (22%)   |
| 💡 INSIGHTFUL   4 (9%)    |
| ❤️ LOVE         2 (4%)    |
| 🤔 CURIOUS      1 (2%)    |
+---------------------------+
```

**Option B: PublisherAnalytics.tsx - New "Reaction Mix" card**
```text
+--------------------------------------------------+
| REACTION MIX                    [pie chart icon] |
|                                                   |
|  [=================] 👍 LIKE        62%          |
|  [========]         🎉 CELEBRATE   22%          |
|  [===]              💡 INSIGHTFUL   9%          |
|  [==]               ❤️ LOVE         4%          |
|  [=]                🤔 CURIOUS      2%          |
|  [=]                🤝 SUPPORT      1%          |
+--------------------------------------------------+
```

**Database Changes:**
```sql
ALTER TABLE posts ADD COLUMN reaction_like INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN reaction_celebrate INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN reaction_support INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN reaction_love INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN reaction_insightful INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN reaction_curious INTEGER DEFAULT 0;
```

**Edge Function Update:**
Add API calls to fetch reaction breakdown per post using the LinkedIn reactions endpoint.

---

### 3. Comments & Conversation Data

**What you can track:**
- Comment count (already tracked)
- Reply threading depth
- Comment timestamps
- Top commenters

**Where to display:**

**PostRow.tsx - Enhanced comment indicator**
```text
Current: [💬 12]
Enhanced: [💬 12 (3 threads)]
```

**PublisherAnalytics.tsx - New "Conversation Depth" card**
```text
+--------------------------------------------------+
| CONVERSATION METRICS                              |
|                                                   |
|  💬 Total Comments     156                        |
|  🧵 Avg Thread Depth   2.3 replies                |
|  ⚡ Avg Reply Time     4.2 hours                  |
|  🏆 Top Engager        @johndoe (8 comments)     |
+--------------------------------------------------+
```

**Database Changes:**
```sql
-- New table for detailed comment data
CREATE TABLE post_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id),
  linkedin_comment_urn TEXT,
  parent_comment_id UUID REFERENCES post_comments(id),
  author_urn TEXT,
  content TEXT,
  commented_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Add to posts table
ALTER TABLE posts ADD COLUMN avg_reply_depth NUMERIC;
ALTER TABLE posts ADD COLUMN thread_count INTEGER DEFAULT 0;
```

---

### 4. Link Click Analytics (Organization Posts Only)

**What you can track:**
- Click count
- CTR (Click-through rate)

**Where to display:**

**PostRow.tsx - For link posts only**
```text
+--------------------------------------------------+
| [🔗 LINK] Publisher Name                          |
|                                                   |
| Check out our new product launch...              |
|                                                   |
| 👁 1,234  👤 892  ❤️ 45  🔗 89 clicks (7.2% CTR) |
+--------------------------------------------------+
```

**Database Changes:**
```sql
ALTER TABLE posts ADD COLUMN link_clicks INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN click_through_rate NUMERIC;
```

**Note:** Only available for organization posts, so UI should gracefully hide this for member posts.

---

### 5. Video Analytics

**What you can track:**
- Video views
- Unique viewers
- Watch time
- Completion rate
- View milestones (25/50/75/100%)

**Where to display:**

**PostRow.tsx - Enhanced video post display**
```text
+--------------------------------------------------+
| [🎬 VIDEO] Publisher Name                         |
|                                                   |
| [Video thumbnail placeholder]                     |
|                                                   |
| 👁 1,234  ▶️ 892 views  ⏱️ 45% completion         |
+--------------------------------------------------+
```

**PublisherAnalytics.tsx - New "Video Performance" section**
```text
+--------------------------------------------------+
| VIDEO PERFORMANCE                                 |
|                                                   |
|  ▶️ Total Views        12,450                     |
|  👤 Unique Viewers      8,920                     |
|  ⏱️ Avg Watch Time     1:24                       |
|  ✅ Completion Rate     34%                       |
|                                                   |
|  View Milestones:                                 |
|  [████████████████████] 25%  92%                 |
|  [██████████████]       50%  68%                 |
|  [████████]             75%  41%                 |
|  [█████]               100%  28%                 |
+--------------------------------------------------+
```

**Database Changes:**
```sql
ALTER TABLE posts ADD COLUMN video_views INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN video_unique_viewers INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN video_watch_time_seconds INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN video_completion_rate NUMERIC;
ALTER TABLE posts ADD COLUMN video_milestone_25 INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN video_milestone_50 INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN video_milestone_75 INTEGER DEFAULT 0;
ALTER TABLE posts ADD COLUMN video_milestone_100 INTEGER DEFAULT 0;
```

---

### 6. Time-Based Analytics (Trend Tracking)

**What you can track:**
- Lifetime totals (already implemented)
- Daily aggregates
- Velocity/momentum

**Where to display:**

**Analytics.tsx - Enhanced Performance Chart**
```text
+--------------------------------------------------+
| PERFORMANCE OVER TIME          [7D] [30D] [90D]  |
|                                                   |
|  [Multi-line chart showing:]                      |
|  - Impressions (already shown)                    |
|  - Reach (already shown)                          |
|  - Reactions (already shown)                      |
|  + Comments (NEW line)                            |
|  + Reshares (NEW line)                            |
|                                                   |
+--------------------------------------------------+
```

**PublisherAnalytics.tsx - New "Momentum Tracker" card**
```text
+--------------------------------------------------+
| MOMENTUM TRACKER                                  |
|                                                   |
|  This Week vs Last Week                           |
|  📈 Impressions   +24%  ▲                         |
|  👤 Reach         +18%  ▲                         |
|  ❤️ Reactions     +45%  ▲▲                        |
|  💬 Comments      -12%  ▼                         |
|                                                   |
|  Velocity: 🔥 HIGH (Peak engagement phase)       |
+--------------------------------------------------+
```

**Database Changes:**
Create a new table for historical snapshots:
```sql
CREATE TABLE post_analytics_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id UUID REFERENCES posts(id),
  snapshot_date DATE NOT NULL,
  impressions INTEGER DEFAULT 0,
  unique_impressions INTEGER DEFAULT 0,
  reactions INTEGER DEFAULT 0,
  comments INTEGER DEFAULT 0,
  reshares INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(post_id, snapshot_date)
);
```

---

## Implementation Priority

| Priority | Feature | Complexity | Value |
|----------|---------|------------|-------|
| **P1** | Reaction breakdown | Medium | High - engagement quality insights |
| **P1** | Video analytics | Medium | High - rich data for video posts |
| **P2** | Post type indicators | Low | Medium - visual clarity |
| **P2** | Comments/conversation depth | Medium | Medium - engagement quality |
| **P3** | Link click analytics | Low | Medium - only for org posts |
| **P3** | Time-based snapshots | High | High - requires scheduled jobs |

---

## Files to Create/Modify

| File | Changes |
|------|---------|
| **Database Migration** | Add new columns to `posts` table, create `post_comments` and `post_analytics_history` tables |
| `src/types/post.ts` | Add new fields: postType, reactionBreakdown, videoMetrics, etc. |
| `src/hooks/usePosts.tsx` | Map new fields from database |
| `src/hooks/useAnalytics.tsx` | Add aggregation for new metrics |
| `supabase/functions/fetch-linkedin-posts/index.ts` | Fetch additional metrics from LinkedIn API |
| `src/components/PostRow.tsx` | Add post type badge, reaction tooltip, video metrics |
| `src/components/ReactionBreakdown.tsx` | **NEW** - Reaction mix visualization |
| `src/components/VideoMetrics.tsx` | **NEW** - Video performance display |
| `src/components/ConversationMetrics.tsx` | **NEW** - Comment/thread analysis |
| `src/components/MomentumTracker.tsx` | **NEW** - Week-over-week comparison |
| `src/pages/Analytics.tsx` | Add reaction mix chart, video stats section |
| `src/pages/PublisherAnalytics.tsx` | Add per-publisher reaction mix, video stats, momentum |

---

## Visual Design System

### New Icons & Colors
```text
Post Types:
📝 Text     → FileText    → text-muted-foreground
🖼️ Image    → Image       → text-blue-400
🎬 Video    → Video       → text-purple-400
🔗 Link     → Link2       → text-green-400

Reactions:
👍 Like        → ThumbsUp    → text-blue-500
🎉 Celebrate   → PartyPopper → text-orange-500
🤝 Support     → Handshake   → text-green-500
❤️ Love        → Heart       → text-red-500
💡 Insightful  → Lightbulb   → text-yellow-500
🤔 Curious     → HelpCircle  → text-purple-500

Trends:
▲ Positive   → TrendingUp   → text-success
▼ Negative   → TrendingDown → text-destructive
━ Neutral    → Minus        → text-muted-foreground
```

### Component Styling (Techy Theme)
All new components should follow the existing CyberCard styling:
- Monospace fonts for numbers (`font-mono tabular-nums`)
- Glow effects on stat cards (`stat-glow`)
- Animated count-up on numbers (`CountUp` component)
- Border gradient effects on focus/hover

---

## Edge Function API Calls

### Reaction Breakdown Endpoint
```typescript
// GET reactions by type
const reactionsUrl = `https://api.linkedin.com/rest/reactions?q=entity&entity=${postUrn}&projection=(elements*(reactionType,count))`;
```

### Video Analytics Endpoint
```typescript
// GET video statistics
const videoUrl = `https://api.linkedin.com/rest/videoAnalytics?q=entity&entity=${videoUrn}`;
```

### Comments Endpoint
```typescript
// GET comments with threading
const commentsUrl = `https://api.linkedin.com/rest/socialActions/${postUrn}/comments?projection=(elements*(id,actor,message,parentComment,created))`;
```

---

## Summary

This plan extends your existing techy analytics UI with rich LinkedIn data while maintaining the current architecture. The highest-value additions are:

1. **Reaction breakdown** - Understand what types of engagement you're getting
2. **Video analytics** - Deep insights for video content
3. **Conversation metrics** - Measure discussion quality
4. **Momentum tracking** - See if posts are growing or decaying

All new metrics fit naturally into your existing `PostRow`, `Analytics`, and `PublisherAnalytics` pages, using the same visual language (CyberCards, CountUp animations, monospace typography).

