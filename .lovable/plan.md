## 1. Fix "Remove profile" (does nothing)

The delete lives inside a `DropdownMenu` and uses a two-click "click again to confirm" pattern. The dropdown closes on the first click, so the confirm state is invisible and the target never gets deleted.

**Fix:** Replace the two-click pattern with an `AlertDialog` confirm modal in `PostPanel.tsx`. Single click → modal with target name → Confirm calls `deleteTarget.mutate`. Also close/clear the panel after delete so the deleted row visibly disappears.

## 2. Show daily sync results (new posts + last run status)

Everything is already in the `engagement_sync_runs` table — we just don't surface it. Add a small "Last sync" summary card at the top of the ContactList (or in the Engagement header) showing:

- Time of last cron run for this workspace
- `X new posts · Y targets synced · Z failed` from the latest `engagement_sync_runs` row
- Expandable list of per-target results (name, status, posts_found) from the `details` JSON
- Empty state ("No sync has run yet") when the table has no rows

New hook `useEngagementSyncRuns(workspace_id)` returning latest N runs.

## 3. Auto-like server-side (works with UI closed)

Today auto-like only runs while `PostPanel` is mounted for a target. Move it into the cron so it works headless.

New edge function `auto-like-target-posts`:
- Input: `{ workspace_id, target_id }`
- Loads target; only runs when `target.auto_like = true`
- Finds `engagement_posts` for target where `is_liked = false`
- For each unliked post: checks publisher's daily cap (reuses the same 30/publisher/day rule from `like-linkedin-post`), invokes `like-linkedin-post` with `auto: true`, sleeps 6–12s between calls, stops on cap or auth error
- Writes a summary row to `engagement_auto_like_runs`

Wire it into `sync-all-engagement-targets` right after `fetch-target-posts` for each target that has `auto_like = true`. Respects existing 18h target cooldown and workspace cancel flag.

## 4. Per-day auto-like history (count + which targets)

New table `engagement_auto_like_runs`:

```text
id, workspace_id, publisher_id, target_id,
post_id (FK engagement_posts), post_url,
status ('liked' | 'skipped_cap' | 'skipped_already' | 'failed'),
error_message, run_at, trigger ('cron' | 'manual')
```

Grants + RLS scoped by `user_has_workspace_access(workspace_id)`. Every successful auto-like (both existing client-side path in `PostPanel` and the new cron path) inserts a row. Also expose `liked_at` (already on `engagement_posts`) so we can group by day.

## 5. Sort targets: active-first, quiet-last

In `ContactList.tsx`, extend the current sort so any target with `unseen_count > 0` OR fresh posts in the last 48h floats to the top; targets with zero posts sink to the bottom. Add a subtle "Quiet" separator label between the two groups (still a single scroll list). No new filter chips — one ordered list per folder.

## 6. New "Activity" tab on /engagement

Add a tab switcher at the top of `/engagement`: **Feed** (current view) | **Activity**. Activity is a per-publisher dashboard:

- Publisher picker (reuses current sidebar publishers)
- Date range chips: Today · 7d · 30d
- Top KPI row: Auto-likes done · Posts discovered · Comments posted · Manual likes
- Table 1 — Auto-likes: date, target name, post excerpt, link out to LinkedIn, status
- Table 2 — New posts from targets: date, target name, post excerpt, likes/comments count, "Open in feed" jump
- Table 3 — Sync runs: date, new posts, synced/failed/skipped, expandable per-target details
- Sortable columns; text filter across target names

Data sources: `engagement_auto_like_runs`, `engagement_posts` (grouped by `created_at` day and target), `engagement_comments`, `engagement_sync_runs`. All workspace-scoped.

## Technical section

**Files touched**
- New migration: `engagement_auto_like_runs` table + grants + RLS
- New edge function: `supabase/functions/auto-like-target-posts/index.ts`
- Edit: `supabase/functions/sync-all-engagement-targets/index.ts` (invoke auto-like after fetch-target-posts)
- Edit: `supabase/functions/like-linkedin-post/index.ts` (record row into `engagement_auto_like_runs` when `auto: true`)
- Edit: `src/components/engagement/PostPanel.tsx` (AlertDialog delete, clear selected target after delete)
- Edit: `src/components/engagement/ContactList.tsx` (active-first sort + "Quiet" divider, top sync summary card)
- New hook: `src/hooks/useEngagementSyncRuns.tsx`
- New hook: `src/hooks/useAutoLikeHistory.tsx`
- Edit: `src/pages/Engagement.tsx` (Feed/Activity tab switcher)
- New: `src/pages/EngagementActivity.tsx` (KPI + tables)

**Non-goals** — no changes to comment posting flow, no changes to Apify scraping, no auth/OAuth changes.
