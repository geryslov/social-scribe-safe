

## Plan: Add Comments Stat Card to the Posts Page

### What's Missing

The Posts page currently shows 4 summary stat cards: **Total Reach**, **Impressions**, **Reactions**, and **Avg Engagement**. The `totalComments` value is already calculated in `useAnalytics` but is not displayed anywhere on this page.

### Changes

**File: `src/pages/Posts.tsx`**

Add a 5th stat card for **Comments** in the stats grid (between Reactions and Avg Engagement). This card will:

- Show the `MessageCircle` icon with an appropriate color theme
- Display `analyticsStats.totalComments` using the existing `CountUp` animation
- Be clickable (like the Reactions card) to open the `AllReactorsPanel`, which already aggregates both reactors and commenters
- Update the grid from `grid-cols-2 md:grid-cols-4` to `grid-cols-2 md:grid-cols-5` to accommodate the new card

Additionally, add a **Reshares** stat card since that data (`totalReshares`) is also already available in `analyticsStats` but not shown. This brings the grid to 6 cards (`grid-cols-2 md:grid-cols-3 lg:grid-cols-6`).

### Technical Details

The stat values `analyticsStats.totalComments` and `analyticsStats.totalReshares` are already computed in `useAnalytics.tsx` (lines 96-97). No backend changes or new queries are needed -- this is purely a UI addition using existing data.

The Comments card will reuse the `MessageCircle` icon from lucide-react (already imported in other components) and the Reshares card will use the `Repeat2` icon.

