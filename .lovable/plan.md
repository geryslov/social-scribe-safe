

## Current State

The platform **already supports** image attachments on posts:
- **PostModal**: Has image/video upload UI → uploads to `post-media` storage bucket
- **linkedin-post edge function**: Already implements LinkedIn's `registerUpload` API to upload images with posts
- **LinkedInPublishModal**: Already passes `mediaUrl` to the edge function
- **usePosts hook**: Already fetches and maps `media_url` from the database

## What's Missing

The **LinkedInPostCard** (feed view) never renders the attached image. Users attach images but can't see them in the post feed.

## Implementation Steps

1. **Update LinkedInPostCard** — Add image/video preview between the post content and the engagement summary section. If `post.mediaUrl` exists:
   - For images: render an `<img>` tag with rounded corners and max height
   - For videos: show a video indicator badge (matching existing pattern)

2. **Update LinkedInPublishModal** — The modal already shows a small media preview. No changes needed; it already sends `mediaUrl` to the edge function.

That's it — one component change. The entire upload → store → publish-to-LinkedIn pipeline is already functional.

