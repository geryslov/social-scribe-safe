// Validates a third-party API token before storing it.
// Input:  { service: 'apify' | 'brave' | 'scrapecreators', api_key: string }
// Output: { valid: boolean, info?: string, error?: string }

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function validateApify(token: string) {
  const res = await fetch(`https://api.apify.com/v2/users/me?token=${encodeURIComponent(token)}`);
  if (!res.ok) {
    const text = await res.text();
    return { valid: false, error: `Apify rejected token (${res.status}): ${text.slice(0, 200)}` };
  }
  const data = await res.json();
  const username = data?.data?.username || data?.data?.id;
  return { valid: true, info: username ? `Connected as ${username}` : 'Token valid' };
}

async function validateBrave(token: string) {
  const res = await fetch('https://api.search.brave.com/res/v1/web/search?q=test&count=1', {
    headers: { 'X-Subscription-Token': token, Accept: 'application/json' },
  });
  if (!res.ok) {
    const text = await res.text();
    return { valid: false, error: `Brave rejected token (${res.status}): ${text.slice(0, 200)}` };
  }
  await res.text();
  return { valid: true, info: 'Token valid' };
}

async function validateScrapeCreators(token: string) {
  // Lightweight check: hit a known endpoint; treat 401/403 as invalid.
  const res = await fetch('https://api.scrapecreators.com/v1/linkedin/profile?url=https://www.linkedin.com/in/williamhgates/', {
    headers: { 'x-api-key': token },
  });
  if (res.status === 401 || res.status === 403) {
    return { valid: false, error: `ScrapeCreators rejected token (${res.status})` };
  }
  await res.text();
  return { valid: true, info: 'Token accepted' };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  try {
    const { service, api_key } = await req.json();
    if (!service || !api_key) {
      return new Response(JSON.stringify({ valid: false, error: 'service and api_key required' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let result: { valid: boolean; info?: string; error?: string };
    switch (service) {
      case 'apify': result = await validateApify(api_key); break;
      case 'brave': result = await validateBrave(api_key); break;
      case 'scrapecreators': result = await validateScrapeCreators(api_key); break;
      default:
        result = { valid: true, info: 'No validator for this service; saved without check' };
    }

    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Validation failed';
    return new Response(JSON.stringify({ valid: false, error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
