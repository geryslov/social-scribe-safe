
## Make AI Post Generation Available to All Workspaces (Admin-Only)

### Current Behavior
The "AI Create" button in the document upload modal is gated by `isLegacyWorkspace` — a hardcoded check comparing `currentWorkspace?.id` to a specific workspace UUID. This means AI generation is only available inside the single "Legacy Data" workspace.

### Goal
Make AI generation available in **every** workspace, but only when the logged-in user is `geryslov@gmail.com`. All other users continue to see the greyed-out, disabled "AI Create" card.

### Implementation Approach

The simplest and most maintainable approach is to change the `showAiCreate` flag from being based on workspace identity to being based on user identity. The `user` object is already available from `useAuth()` in both `Posts.tsx` and `DocumentLibrary.tsx`.

No database changes, no new tables, no migrations required — the email check is purely a client-side gate on the UI element, which is appropriate here because:
- The underlying `create-document` edge function is already protected and there is no security risk in showing/hiding a UI button
- The user is already authenticated via Supabase Auth, so `user.email` is trustworthy (it comes from the verified session, not from client-side storage)

### Files to Modify

**1. `src/pages/Posts.tsx`**
- Import `useAuth` (already imported)
- Replace `isLegacyWorkspace` with `canUseAiCreate` based on `user?.email === 'geryslov@gmail.com'`
- Pass `canUseAiCreate` as `showAiCreate` to `DocumentUploadModal`

**2. `src/pages/DocumentLibrary.tsx`**
- Import `useAuth` (need to add)
- Replace `isLegacyWorkspace` check with `canUseAiCreate` based on `user?.email === 'geryslov@gmail.com'`
- Pass `canUseAiCreate` as `showAiCreate` to `DocumentUploadModal`

### Technical Details

The change in both files is straightforward:

```typescript
// Before
const LEGACY_WORKSPACE_ID = 'f26b7a85-d4ad-451e-8585-d9906d5b9f95';
const isLegacyWorkspace = currentWorkspace?.id === LEGACY_WORKSPACE_ID;
// ... showAiCreate={isLegacyWorkspace}

// After
const { user } = useAuth();
const canUseAiCreate = user?.email === 'geryslov@gmail.com';
// ... showAiCreate={canUseAiCreate}
```

The `LEGACY_WORKSPACE_ID` constant can be removed entirely from both files (it is not used for anything else in Posts.tsx; in DocumentLibrary.tsx and Analytics.tsx it may still be needed for other features — those will be checked and left untouched).

### What Users See
- **geryslov@gmail.com**: The "AI Create" card is fully active and clickable in the document modal, regardless of which workspace is currently active.
- **All other users**: The "AI Create" card remains greyed out with "Not available" text, exactly as before.
