

# Remove Lovable AI from PDF Parsing -- Send Everything to Anthropic

## Problem
The `parse-document` edge function currently has a fallback (lines 72-119) that calls Lovable AI (Google Gemini) to extract text from PDFs when native text extraction yields less than 50 characters. You want all AI processing to go exclusively through Anthropic.

## Solution

### Change 1: Update `supabase/functions/parse-document/index.ts`
- Remove the Lovable AI fallback (lines 72-119) from the `parsePdf` function
- Instead, when native PDF extraction fails, send the raw PDF content (base64-encoded) to **Anthropic's Claude API** using the existing `ANTHROPIC_API_KEY` secret
- Claude will extract the text from the PDF, keeping all AI processing on one provider

### Change 2: Verify `supabase/functions/create-document/index.ts`
- This function already sends everything (website content, reference content, length, post count) directly to Anthropic -- no changes needed here

## Technical Details

In `parse-document/index.ts`, the Lovable AI block (lines 72-119) will be replaced with an Anthropic API call:
- Use the `ANTHROPIC_API_KEY` secret (already configured)
- Use Claude's vision capability to process the PDF as a base64 document
- Model: `claude-sonnet-4-5-20250929` (same as `create-document` uses)
- The API endpoint: `https://api.anthropic.com/v1/messages`
- Send the PDF as a `base64` source with `media_type: "application/pdf"`

Everything else in the flow stays the same -- native text extraction is attempted first, and Claude is only called as a fallback for image-heavy or complex PDFs.

