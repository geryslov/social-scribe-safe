# Role-based workspace permissions

Add preset permissions tied to existing workspace roles. Owner/admin manage member roles; the UI hides or disables gated actions; the backend enforces them via RLS and edge functions.

## Roles → allowed actions

| Action | owner | admin | creator | member |
|---|---|---|---|---|
| AI post generation (create-document, rewrite-section, generate-comment) | ✓ | ✓ | ✓ | – |
| Assign posts/documents/sections to a publisher | ✓ | ✓ | ✓ | – |
| Publish to LinkedIn (linkedin-post, post-linkedin-comment, like-linkedin-post) | ✓ | ✓ | ✓ | – |
| Invite/share workspace (create invite link, add member) | ✓ | ✓ | – | – |
| Edit workspace settings, change roles, remove members | ✓ | ✓ | – | – |
| View posts, documents, analytics, engagement feed | ✓ | ✓ | ✓ | ✓ |

`member` = read-only viewer. Global platform `admin` (in `user_roles`) keeps full access everywhere.

## Backend

1. **SQL helpers** in a new migration:
   - `public.user_workspace_role(_workspace_id uuid) returns text` — security definer, returns the caller's role (or `'admin'` if global admin).
   - `public.user_can_generate_ai(_workspace_id uuid)` → role in (`owner`,`admin`,`creator`).
   - `public.user_can_assign(_workspace_id uuid)` → same set.
   - `public.user_can_publish_linkedin(_workspace_id uuid)` → same set.
   - `public.user_can_manage_workspace(_workspace_id uuid)` → role in (`owner`,`admin`).

2. **RLS tightening** (UPDATE/INSERT only — SELECT stays open to all members):
   - `documents`, `document_sections`, `posts`: writes require `user_can_assign` for assignment columns; AI-generated inserts require `user_can_generate_ai`. Simplest: gate all writes on these tables to `user_can_assign`.
   - `workspace_members`, `workspaces` (updates), invite tables: require `user_can_manage_workspace`.

3. **Edge functions** read the caller's JWT, look up their workspace role, and return `403` if not allowed:
   - `create-document`, `rewrite-section`, `generate-comment` → require `can_generate_ai`.
   - `linkedin-post`, `post-linkedin-comment`, `like-linkedin-post` → require `can_publish_linkedin`.
   - Any invite-creation function → require `can_manage_workspace`.

## Frontend

1. Extend `useWorkspace` to expose `{ role, can: { generateAi, assign, publishLinkedIn, manageWorkspace } }` derived from `workspace_members.role` for the active workspace (global admin overrides to all true).

2. Gate UI:
   - Hide "Generate" / "Rewrite" / "Draft comment" buttons when `!can.generateAi`.
   - Disable publisher select + "Assign" controls in `DocumentPublisherSelect`, `DocumentSectionCard`, `PostModal` when `!can.assign`.
   - Hide "Publish to LinkedIn" in `LinkedInPublishModal`, post panel, and engagement comment "Post"/"Like" buttons when `!can.publishLinkedIn`.
   - Hide Share / invite buttons and member-role editor in `WorkspaceEditModal` when `!can.manageWorkspace`.
   - Show a small "Read-only" badge in the workspace switcher for `member`.

3. **Member management UI** (owner/admin only): in workspace settings, a role dropdown per member (owner / admin / creator / member) using the existing `updateMemberRole` mutation, plus a legend describing what each role can do.

## Technical details

- No new tables; reuse `workspace_members.role` which already supports `owner|admin|creator|member`.
- Keep `user_can_create_in_workspace` as-is; add the new helpers alongside it so existing policies don't churn.
- Edge functions fetch role via a service-role query: `select role from workspace_members where workspace_id=$1 and user_id=$2` plus a global-admin fallback through `has_role(user_id,'admin')`.
- Client checks are UX only; the RLS + edge-function checks are the source of truth.

## Out of scope

- Per-publisher permissions (e.g. "creator A can only assign to publisher X").
- Custom roles or per-action toggles — can be added later by swapping the role check for a permissions table without breaking the helper API.
