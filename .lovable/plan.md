
# Dynamic Workspace Logo in Header

## Overview
Replace the hardcoded Wisor logo in the header with a dynamic logo that displays the current workspace's logo when available, falling back to a generic icon when no logo is set.

## Changes

### File: `src/components/Header.tsx`

1. **Remove static logo import**
   - Remove `import wisorLogo from '@/assets/wisor-logo.svg';`

2. **Add Building2 icon import**
   - Add `Building2` to the lucide-react imports for the fallback icon

3. **Replace the logo element** (lines 51-57)
   - Check if `currentWorkspace?.logoUrl` exists
   - If yes: Display an `<img>` tag with the workspace logo, with proper styling and error handling
   - If no: Display a `Building2` icon as the fallback

**Updated logo section:**
```tsx
<div className="flex items-center gap-3 cursor-pointer" onClick={() => navigate('/')}>
  {currentWorkspace?.logoUrl ? (
    <img 
      src={currentWorkspace.logoUrl} 
      alt={currentWorkspace.name || 'Workspace'} 
      className="h-8 w-auto max-w-[120px] object-contain"
      onError={(e) => {
        // Hide broken image and show nothing
        e.currentTarget.style.display = 'none';
      }}
    />
  ) : (
    <Building2 className="h-8 w-8 text-white" />
  )}
</div>
```

## Behavior
- **With logo**: Shows the workspace's custom logo image
- **Without logo**: Shows a clean Building2 icon in white
- **Error handling**: If the logo URL is broken/invalid, the image hides gracefully
- The logo area remains clickable and navigates to the home page

---

## Technical Details
- Uses the existing `currentWorkspace` from the `useWorkspace()` hook already in use
- The `logoUrl` field is already part of the `Workspace` type and mapped from the database
- No database changes required - uses existing `logo_url` column in `workspaces` table
