

## Analysis: Why "Who Engaged" Data Is Empty

I checked the database and the edge function logs. Here's what's happening:

- **`post_reactors` table: 0 rows** -- no reactor identities were saved
- **`post_comments` table: 0 enriched rows** -- comments API returns 403 ACCESS_DENIED

The UI component ("Who engaged" expandable panel) is already integrated into every post card in feed view. It appears at the bottom of each `LinkedInPostCard` -- but only when `totalReactions > 0` or `totalComments > 0`. Since there's data (reactions exist), the panel should be visible, but clicking "Who engaged" shows "No reactor data yet" because the table is empty.

### Root Cause

From the logs, the reactions endpoint successfully returns reaction counts and breakdown, but **actor URN extraction silently fails**. The log shows:

```
Reaction breakdown: { like: 13, ... }
Collected 0 reactors, resolving names...
```

This means the reaction elements are returned but `element.actor` is either not a string or doesn't start with `urn:li:person:`. LinkedIn's Reactions API likely returns the actor as an object (e.g., `{ actor: "urn:li:member:ABC" }`) or uses `urn:li:member:` instead of `urn:li:person:`.

Additionally, the **Comments API** returns `403 ACCESS_DENIED` because the `partnerApiSocialActions.GET_ALL` permission is not available for this app's OAuth scopes.

### Plan

1. **Fix actor URN extraction in the edge function** -- Add logging to inspect the raw `element.actor` value, then broaden the URN check to accept `urn:li:member:` and other formats alongside `urn:li:person:`. Also handle cases where `actor` might be nested in a sub-field.

2. **Gracefully handle the comments 403** -- The comments API requires a scope your app doesn't have (`partnerApiSocialActions`). Instead of silently failing, show a clear message in the UI: "Comments data requires additional LinkedIn permissions" rather than "No comment data yet. Sync to fetch."

3. **No UI changes needed** -- The `PostEngagersPanel` is already wired into `LinkedInPostCard` and will display data once the backend stores it.

### Technical Details

The fix is in `supabase/functions/fetch-linkedin-posts/index.ts`, specifically the `fetchReactionBreakdown` function around line 224:

```typescript
// Current code (too restrictive):
if (actorUrn && typeof actorUrn === 'string' && actorUrn.startsWith('urn:li:person:')) {

// Fix: accept any LinkedIn person/member URN format
if (actorUrn && typeof actorUrn === 'string' && 
    (actorUrn.startsWith('urn:li:person:') || actorUrn.startsWith('urn:li:member:'))) {
```

Plus add a debug log to capture the raw element structure on the first iteration so we can see exactly what LinkedIn returns.

For the People API resolution, also update `resolveActorNames` to handle `urn:li:member:` URNs.

### Where to See It

Once fixed and re-synced, the "Who engaged" button will appear at the bottom of each post card in **Feed View** (the LinkedIn-style card view on the Posts page). Click the toggle at the top of the posts list to switch from list view to feed view if needed.

