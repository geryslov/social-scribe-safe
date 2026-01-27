

# Plan: Pull Company Information During LinkedIn SSO

## Overview

This plan adds the ability to fetch and store the company/organization a user works at when they log in via LinkedIn SSO. The company name and logo will be displayed alongside the publisher profile throughout the app.

---

## Technical Challenge

The LinkedIn API has **two ways** to get company information, depending on your app's permissions:

### Option A: User's Current Position (Lite Profile)
Requires the `r_liteprofile` scope (part of Sign In with LinkedIn product). This lets you call the `/v2/me` endpoint with projections to get the user's current positions and company names.

### Option B: Organizations User Manages (Marketing API)
Requires `r_organization_admin` or `rw_organization_admin` scope. This returns organizations where the user is an administrator - more useful if your users are posting on behalf of their companies.

**Current State:** Your app already has `openid`, `profile`, `email`, `w_member_social`, `r_member_postAnalytics`, `r_basicprofile` scopes. Getting company information will require adding **`r_liteprofile`** (for personal company info) or organizational scopes (for company pages they manage).

---

## Recommended Approach

Since your app is for LinkedIn posting/analytics, I recommend fetching **both**:
1. **User's Current Company** - Where they work (for display on profile)
2. **Organizations They Manage** - Company pages they can post to (for future company page posting feature)

---

## Implementation Details

### 1. Database Changes

Add new columns to the `publishers` table:

```sql
ALTER TABLE publishers ADD COLUMN company_name TEXT;
ALTER TABLE publishers ADD COLUMN company_logo_url TEXT;
ALTER TABLE publishers ADD COLUMN headline TEXT;  -- LinkedIn headline/title
ALTER TABLE publishers ADD COLUMN managed_organizations JSONB;  -- Future: pages they can manage
```

### 2. Update OAuth Scopes

Modify the SSO flow to request additional scopes:

```typescript
const scopes = [
  'openid',
  'profile', 
  'email',
  'w_member_social',
  'r_member_postAnalytics',
  'r_basicprofile',
  'r_liteprofile',  // NEW: Access to positions/company info
];
```

### 3. Fetch Company Information

After getting the access token, call LinkedIn's profile API with projections to get position data:

```typescript
// Fetch detailed profile with positions
const profileResponse = await fetch(
  'https://api.linkedin.com/v2/me?projection=(id,firstName,lastName,headline,profilePicture(displayImage~:playableStreams),positions)',
  {
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'X-Restli-Protocol-Version': '2.0.0',
    },
  }
);

const profile = await profileResponse.json();
const headline = profile.headline?.localized?.['en_US'];
const currentPosition = profile.positions?.elements?.[0];
const companyName = currentPosition?.companyName?.localized?.['en_US'];
```

### 4. Store in Publisher Profile

Update the publisher creation/update to include the new fields:

```typescript
// In linkedin-auth/index.ts callback-sso handler
await supabase.from('publishers').upsert({
  // existing fields...
  headline: headline || null,
  company_name: companyName || null,
  company_logo_url: companyLogoUrl || null,
});
```

### 5. Display in UI

Update `LinkedInPostCard` and profile displays to show company info:

```text
+----------------------------------------------------------+
|  [AVATAR]  Publisher Name                    • 3h ago    |
|            CMO at TechCorp Inc.                          |
|            [TechCorp Logo] TechCorp Inc.                 |
+----------------------------------------------------------+
```

---

## Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| **Database Migration** | Create | Add `company_name`, `company_logo_url`, `headline` columns |
| `supabase/functions/linkedin-auth/index.ts` | Modify | Add scope, fetch profile data with positions |
| `src/components/LinkedInPostCard.tsx` | Modify | Display headline and company info |
| `src/components/PublisherSidebar.tsx` | Modify | Show company in publisher list |
| `src/hooks/usePublishers.tsx` | Modify | Include new fields in data fetching |

---

## LinkedIn API Details

### Profile Endpoint with Projections

The `/v2/me` endpoint supports projections to fetch nested data:

```
GET /v2/me?projection=(id,firstName,lastName,headline,profilePicture(displayImage~:playableStreams))
```

**Response includes:**
- `headline` - User's LinkedIn headline (e.g., "CMO at TechCorp | Marketing Leader")
- Profile picture in multiple resolutions
- First/last name with localization

### Positions Endpoint (if available)

If `r_liteprofile` provides access:

```
GET /v2/positions?q=member
```

Returns array of positions with company details:
```json
{
  "elements": [{
    "company": "urn:li:organization:123456",
    "companyName": { "localized": { "en_US": "TechCorp Inc." }},
    "title": { "localized": { "en_US": "Chief Marketing Officer" }},
    "current": true
  }]
}
```

---

## Important Considerations

### LinkedIn App Permissions

Your LinkedIn Developer app may need additional products enabled:

1. **Sign In with LinkedIn using OpenID Connect** - Already have this (for SSO)
2. **Share on LinkedIn** - Already have this (`w_member_social`)
3. **Marketing Developer Platform** - May be needed for organization access

To check/add permissions:
1. Go to LinkedIn Developer Console
2. Select your app
3. Go to "Products" tab
4. Request "Sign In with LinkedIn" if not already approved

### Scope Availability

If `r_liteprofile` isn't available for your app, we can fall back to parsing the headline text:
- Headlines often contain company names: "CMO at TechCorp"
- Use regex to extract: `/at\s+(.+?)(?:\||$)/`

---

## Alternative: Parse Headline

If the profile positions API isn't accessible, we can extract company from the headline:

```typescript
// Fallback: parse company from headline
function extractCompanyFromHeadline(headline: string): string | null {
  const patterns = [
    /(?:at|@)\s+([^|•·]+)/i,           // "CMO at TechCorp | ..."
    /,\s+([^|•·,]+)$/i,                 // "CMO, TechCorp"
    /(?:^|\|)\s*([A-Z][^|•·]+)\s*$/i,  // "Marketing | TechCorp"
  ];
  
  for (const pattern of patterns) {
    const match = headline.match(pattern);
    if (match) return match[1].trim();
  }
  return null;
}
```

---

## Summary

This implementation will:

1. **Add database columns** for company info and headline
2. **Expand OAuth scopes** to request profile/position data
3. **Fetch company details** during SSO login
4. **Store and display** company name in the UI
5. **Fallback parsing** if API access is limited

The result: Every publisher profile will show their company affiliation, making the LinkedIn-style cards even more authentic and providing useful context about who's posting.

