Current state
- Bulk delete exists in `ContactList.tsx` but is hidden: open the "..." list menu → "Select multiple" → check profiles → "Delete" → "Confirm?".
- Single delete does not exist in the current `TargetRow` UI; the old `TargetList.tsx` had it but is no longer used.
- The `deleteTarget` / `bulkDeleteTargets` mutations in `useEngagement.tsx` already work and handle RLS via `workspace_id`.

Plan
1. Add a single-profile delete action
   - Add a small action button ("⋮" or trash icon) on each `TargetRow` that opens a confirmation popover.
   - Clicking delete removes that one engagement target and invalidates the target list.
2. Make bulk delete discoverable
   - Replace the hidden "Select multiple" flow with a visible toggle: add a "Manage" button in the list header that immediately shows checkboxes on every row and surfaces the Delete + Move + Cancel actions.
   - Keep the select-all / clear behavior in the same bar.
3. Guardrails
   - Only show delete actions for `isAdmin` (matches existing permission model).
   - Keep the 3-second "Confirm?" pattern for bulk delete to prevent accidents.
   - For single delete, use a small confirmation dialog or popover before calling `deleteTarget`.

Files to change
- `src/components/engagement/ContactList.tsx` — add per-row delete trigger and refactor selection mode entry point.
- No backend changes needed; existing mutations and RLS policies cover deletion.

Outcome
Users can remove one profile with one click + confirm, or enter Manage mode to remove many profiles at once, without hunting through nested menus.