

## Add Image/Video Upload to Posts for LinkedIn Publishing

### Overview
Add the ability to attach an image or video to a post, store it in file storage, and include it when publishing to LinkedIn via the API. The media will be visible in the post card preview and sent along with the LinkedIn publish request.

### What Changes

**1. Storage Bucket**
- Create a new `post-media` public storage bucket for uploaded images/videos
- Add RLS policies so admins can upload and anyone can view

**2. Database**
- Add a `media_url` column (text, nullable) to the `posts` table to store the uploaded file URL

**3. Post Modal (PostModal.tsx)**
- Add a file input that accepts image and video files (jpg, png, gif, mp4, mov)
- Show a thumbnail preview of the selected media
- Allow removing the attached media
- On submit, upload the file to the `post-media` bucket and save the URL to the post

**4. Post Row (PostRow.tsx)**
- Display the attached media (image thumbnail or video icon) below the post content when present

**5. LinkedIn Publish Modal (LinkedInPublishModal.tsx)**
- Show the attached media in the preview section
- Pass the media URL to the edge function

**6. LinkedIn Post Edge Function (linkedin-post/index.ts)**
- When `mediaUrl` is provided:
  - Register an upload with LinkedIn's Images or Video API
  - Download the file from storage
  - Upload the binary to LinkedIn's upload URL
  - Include the media asset URN in the UGC post payload with `shareMediaCategory: 'IMAGE'` or `'VIDEO'` instead of `'NONE'`

**7. Posts Hook (usePosts.tsx)**
- Map the new `media_url` field in `DbPost` and `mapDbToPost`
- Include `media_url` in create/update mutations

### Technical Details

**LinkedIn Image Upload Flow:**
1. Call `POST /v2/assets?action=registerUpload` to get an upload URL and asset URN
2. `PUT` the binary image data to the returned upload URL
3. Include the asset URN in the `ugcPost` payload under `specificContent.com.linkedin.ugc.ShareContent.media`

**File size limits:**
- Images: max 5MB (LinkedIn limit)
- Videos: max 200MB (LinkedIn limit), but we will cap at 20MB for practical purposes

**Storage path format:** `{workspace_id}/{post_id}/{filename}`

### Files to Create/Modify
- **Migration**: Add `media_url` column + create storage bucket
- `src/components/PostModal.tsx` -- add file upload UI
- `src/components/PostRow.tsx` -- show media preview
- `src/components/LinkedInPublishModal.tsx` -- show media in preview, pass to API
- `src/hooks/usePosts.tsx` -- map media_url field
- `src/types/post.ts` -- add mediaUrl field
- `supabase/functions/linkedin-post/index.ts` -- handle media upload to LinkedIn

