

## Auto-populate LinkedIn Profile URL for New Publishers

### What changes
**File: `supabase/functions/linkedin-auth/index.ts`**

1. **Add `vanityName` to the LinkedIn API projection** (line 271):
   - Change projection from `(id,localizedFirstName,localizedLastName,localizedHeadline)` to `(id,localizedFirstName,localizedLastName,localizedHeadline,vanityName)`

2. **Extract vanityName and construct URL** (after line 281):
   - Read `profileData.vanityName` and build `https://www.linkedin.com/in/${vanityName}`

3. **Include `linkedin_url` in the NEW publisher insert only** (line 476):
   - Add `linkedin_url: linkedinProfileUrl` to the insert object
   - Do NOT add it to the existing publisher update path (line 414) — existing users keep their current null value until you manually provide their URLs

### What stays the same
- Existing publishers are not touched on re-login
- No database migration needed — `linkedin_url` column already exists
- You'll send me existing publisher URLs manually and I'll update them

