## Per-Workspace Reactors Export

Add an in-app button so each workspace can export its own engagers (reactors + commenters) as a CSV — same shape as the file I just generated, but scoped to the current workspace and runnable by any workspace member.

### Where the button goes

Add an "Export engagers (CSV)" button in the Analytics page header (`src/pages/Analytics.tsx`), next to the existing time range / filter controls. Visible to any user with workspace access (no admin gate — they only get their own workspace's data via RLS).

### How the export works (client-side)

1. Read `currentWorkspace.id` from `useWorkspace()`.
2. Query `posts` filtered by `workspace_id` to get post IDs + publisher_name + scheduled/published date (RLS already restricts this to the user's workspace).
3. Query `post_reactors` where `post_id IN (...workspace post ids...)`.
4. Query `post_comments` where `post_id IN (...)` (optional second sheet — see below).
5. Aggregate in the browser by `actor_urn` (or `actor_profile_url` fallback):
   - name, headline, profile URL
   - total_reactions, posts_engaged
   - breakdown per reaction type (like / celebrate / love / insightful / support / funny / curious)
   - first_reaction, last_reaction
6. Convert to CSV string and trigger download via a Blob + `<a download>` — no server roundtrip needed.

### CSV columns

```
actor_name, actor_headline, actor_profile_url,
total_reactions, posts_engaged,
likes, celebrate, love, insightful, support, funny, curious,
first_reaction, last_reaction
```

Filename: `{workspace-slug}-engagers-{YYYY-MM-DD}.csv`

### Optional: include commenters

Add a small dropdown on the button: "Reactors only" / "Reactors + Commenters". When commenters are included, add columns `total_comments` and `total_engagements` (reactions + comments) and merge by profile URL.

### Files to change

- `src/pages/Analytics.tsx` — add button + handler
- `src/lib/exportReactors.ts` (new) — pure function `exportWorkspaceReactors(workspaceId, workspaceSlug, opts)` that does the queries, aggregation, CSV build, and download trigger

### Notes

- No DB / RLS changes needed — `post_reactors` is already SELECT-public and `posts` is workspace-scoped, so joining on workspace post IDs naturally restricts the export.
- For very large workspaces we'll page the `post_reactors` query in chunks of 1000 (Supabase default limit).