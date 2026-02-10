

# Store Anthropic API Key and Fix Document Generation

## What We'll Do
Store your Anthropic API key as a secure backend secret so the document generation feature works.

## Steps

1. **Add the `ANTHROPIC_API_KEY` secret** using the secrets tool so it's securely stored and accessible by the backend function.

2. **Redeploy the `create-document` function** to pick up the new secret.

No code changes are needed -- the existing `create-document` function already uses `ANTHROPIC_API_KEY` correctly.

## Important Security Note
Since the key you shared is now visible in chat history, you should:
- Go to [Anthropic Console](https://console.anthropic.com/settings/keys)
- Revoke the exposed key
- Generate a new one
- We'll store the new key as the secret

