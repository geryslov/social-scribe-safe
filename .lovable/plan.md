# Simplify the Engage page — one "Today" table

## The problem

Right now the top of the Engage page shows the same profile across 5+ places that count different things and use overlapping words. That's why "25 profiles synced" and "26 posts across 11 profiles" look wrong when they aren't.

Confusions we're removing:
- "profiles checked" (post-sync today) vs "profiles with posts" (any post ever stored) vs "in queue" (enrichment, a totally different pipeline)
- "posts" meaning both "all-time in DB" and "fetched in a window"
- "failed" meaning three different things (enrichment failed / post-sync failed / like-comment failed) depending on where it appears
- Time windows mixed without labels: today, yesterday, 7d, all-time all on the same row

## The new layout

```text
┌─────────────────────────────────────────────────────────────────┐
│  Engage · [Publisher pill]           [Sync live · 12/25]  [Stop]│
│                                      [Add profile] [Review N]   │
├─────────────────────────────────────────────────────────────────┤
│  TODAY                                             Jul 19, 2026 │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │ Profile          Checked  New posts  Liked  Commented  ⚠ │  │
│  │ ─────────────────────────────────────────────────────────│  │
│  │ Elisa Hebert     ✓ 09:12    2         1       0       —  │  │
│  │ Lisa Nelson      ✓ 09:12    0         —       —       —  │  │
│  │ Bart Jansen      ✓ 09:13    1         0       0       —  │  │
│  │ Nick Mata        ✗ failed   —         —       —      Retry│ │
│  │ Aryeh Bloom      · pending  —         —       —       —  │  │
│  │ ...                                                       │  │
│  │ ─────────────────────────────────────────────────────────│  │
│  │ Totals           23/25      26        4       1       2  │  │
│  └───────────────────────────────────────────────────────────┘  │
│  Every column has a plain-English tooltip                       │
├─────────────────────────────────────────────────────────────────┤
│  ▸ Details (7-day chart · daily timeline · all-time totals)     │
│    ← collapsed by default                                       │
└─────────────────────────────────────────────────────────────────┘
```

One primary view: **the Today table**. One row per profile the selected publisher is watching. Five columns, all scoped to today, all in the same time window, all using the same word "today". No more mixing.

## Column contract (fixed meanings)

| Column | Counts | Time window |
|---|---|---|
| **Checked** | ✓ with sync time, or ✗ failed with Retry, or · pending / running | today only |
| **New posts** | posts fetched from this profile today | today only |
| **Liked** | likes YOU (auto or manual) performed on this profile's posts today | today only |
| **Commented** | comments YOU posted on this profile's posts today | today only |
| **⚠** | any action failure today (like failed, comment failed) with reason on hover | today only |

Totals row sums each column. That's the ONE place "how many profiles synced today" and "how many posts fetched today" live — no other card contradicts it.

## What moves off the top

- **Enrichment queue** (pending / processing / failed for newly-added profiles) → deletes from the top bar entirely. Each in-progress profile shows its state inline in the left contact list where it already lives (it already does this at line 1081-ish; we keep that and remove the top-bar chip). Once enrichment finishes, the profile appears in the Today table normally.
- **KPI cards** (Total posts, Likes completed, Comments completed, Failures) → deleted from the top. Their info is in the Today totals row and the Details section.
- **Smart summary card** ("26 total posts across 11 profiles") → deleted. That specific comparison is what caused this thread.
- **Daily sync timeline (7 rows)** → moves into Details, unchanged.
- **Activity chart (7-day)** → moves into Details, unchanged.

## Details section (collapsed by default)

Click "▸ Details" to expand. Inside, three sub-sections with a clear header on each so the time window and pipeline are obvious:

1. **7-day post-sync history** — the existing DailySyncTimeline, header renamed to "Post-sync history (last 7 days)". Synced / failed / skipped chips already work.
2. **7-day engagement activity** — the existing chart, header renamed to "Your engagement (last 7 days)". Legend labels stay New posts / Likes / Comments / Checks.
3. **All-time totals** — a small strip: "Posts stored (all-time): X · Profiles being tracked: Y · Auto-like today: N of 30".

Nothing new is computed; we just move and rename.

## Live sync + Stop stay where they are

The live-progress pill and Stop button we added last turn stay in the header exactly as they are. They're already labeled "synced / total · N failed · N new" and they already stop chained hops — no change.

## Tooltips (the second half of the fix)

Every number in the Today table header, the totals row, and the Details section gets a hover tooltip in one of exactly three shapes:

- "Counts X. Scope: today (since 00:00 your time)."
- "Counts X. Scope: last 7 days."
- "Counts X. Scope: all-time in this workspace."

No number is allowed on the page without one of these three tooltips. That's how we make sure the words never lie about the window again.

---

## Technical section

**Files:**
- `src/pages/Engagement.tsx` — replace the block from line ~620 (status bar) through line ~765 (chart empty state) with:
  - `<TodayTable publisherId={publisher.id} />` — new component in the same file, ~180 lines.
  - `<EngageDetails collapsed />` — wraps existing `DailySyncTimeline` + activity chart + a small all-time strip in a `<Collapsible>` (shadcn).
- Remove: `TotalPostsCard`, `LikesCompletedCard`, and the "Smart summary" JSX block (lines ~659-689). Keep the `KpiCard` primitive around only if `EngageDetails` uses it; otherwise delete.
- The system status bar (`profilesChecked / totalProfiles / next sync in / queue`) is deleted. Live progress + Stop already live in `PageHeader`.

**Data — no new queries, no new tables:**
- Existing `activeTargets` (from `useEngagementTargets`) → row set.
- Existing `syncRuns` (from `useEngagementSyncRuns`) → per-target status for today. Reuse the exact dedup logic we just added to `dailySyncRows`: for each target, take the latest status from today's runs (`synced` / `failed` / `skipped_cooldown`). A target that fails 5 hops still counts as 1.
- Existing `discovered` (from `useDiscoveredPosts`) → filter `created_at >= startOfLocalDay(new Date())` and group by `target_id` for the "New posts" column.
- Existing `likes` array (already in scope, drives `LikesCompletedCard`) → filter `run_at >= todayStart` and group by `publisher_target_id` for the "Liked" column.
- Comments today: reuse the same query that powers `commentedToday` today, grouped by target.
- "Checked" column value: `target.last_fetched_at` if it lands today → ✓ with `HH:mm`; else latest today-run status if failed/skipped/running; else `—`.

**Tooltip primitive:** shadcn `<Tooltip>` already in the project. One small helper `<Metric label value scope />` where `scope` is one of `'today' | '7d' | 'all-time'` — renders the tooltip text automatically so we can't drift.

**Enrichment:** already displayed inline in `ContactList.tsx` at line ~1081 (`Sync failed · Retry` badge for `enrichment_status === 'failed'`) and via the processing/pending states. Nothing to move — we just stop rendering the `queueTotal / queuePending / queueProcessing / queueFailed` chip in the top status bar.

**Sorting/filtering the Today table (v1):**
- Default sort: profiles with new posts today first, then failed, then everything else alphabetically.
- No filter chips in v1 to keep it simple; add later if needed.

**What we're NOT touching:**
- Edge functions, cron, sync logic, auto-like logic — unchanged.
- Contact list (left column) — unchanged.
- Post panel (right column when a profile is selected) — unchanged.
- The `PageHeader` (title, live progress pill, Stop, Manual sync, Add profile, Review N button) — unchanged.
