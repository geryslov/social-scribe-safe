# Plan: Voice Profile Takes Priority Over Tone

When a selected publisher has a `voice_profile`, the Tone & Style setting should be ignored so the writer's voice is preserved.

## Backend — `supabase/functions/create-document/index.ts`

- After resolving `publisherProfiles` and `toneInstruction`, compute:
  - `anyVoiceProfile = publisherProfiles?.some(p => p.voiceProfile)`
- If `anyVoiceProfile` is true, skip appending `toneInstruction` to the user message.
- Log which mode was used (`tone applied` vs `tone skipped: voice profile active`) for debugging.
- Multi-publisher case: if *any* selected publisher has a voice profile, skip tone globally (consistent behavior, avoids mixed prompt). Publishers without a profile still fall back to their "professional voice" default block already in the prompt.

## Frontend — UX hint

In the two surfaces that expose the Tone dropdown for AI generation:
- `src/components/DocumentUploadModal.tsx`
- `src/components/intelligence/CreateDocumentFromFeed.tsx` (only if it actually exposes tone; if not, leave alone)

When the selected publisher(s) have a voice profile:
- Disable the Tone select.
- Show small helper text under it: "Voice profile active — tone is set by the writer's voice profile."

No DB changes. No type changes. No new files.

## Verification

1. Generate a post for a publisher *with* a voice profile and tone = "Aggressive" → output should match the voice profile, not aggressive tone. Check edge function logs for `tone skipped`.
2. Generate for a publisher *without* a voice profile and tone = "Aggressive" → tone should apply as today.
3. Multi-publisher mix → tone skipped, each writer uses their own voice (or professional fallback).
