

# Update System Prompt in `create-document` Edge Function

## Overview
Append the provided content framework to the existing system prompt in `supabase/functions/create-document/index.ts`. The current prompt covers core principles, structural requirements, and formatting rules. The new content adds extensive sections on hooks, narrative arcs, data integrity, tone, LinkedIn optimization, persona targeting, advanced techniques, and more.

## Technical Details

**File to modify:** `supabase/functions/create-document/index.ts`

**What changes:**
- Append the full provided framework text to the end of the `SYSTEM_PROMPT` string (before the closing backtick), starting from the `## CORE PRINCIPLES` section through `## FRAMEWORK ATTRIBUTION`.
- Some sections overlap with existing prompt content (e.g., formatting rules, data integrity, power phrases). The new content will serve as expanded, more detailed guidance alongside the existing rules -- no existing content will be removed.

**After editing:** Redeploy the `create-document` edge function so the updated prompt takes effect.

## Steps

1. Edit `supabase/functions/create-document/index.ts` -- append the full framework text to `SYSTEM_PROMPT`
2. Redeploy the `create-document` edge function
3. Test document generation to confirm the new prompt works

