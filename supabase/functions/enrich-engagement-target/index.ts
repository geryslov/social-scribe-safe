// =============================================================================
// enrich-engagement-target — Auto-fill an engagement target from LinkedIn
//
// Uses Apify (workspace_api_keys service "apify") to scrape the LinkedIn
// profile and populate first_name, last_name, name, title, company_name,
// headline and avatar_url on the engagement_targets row.
//
// Input:  { target_id }
// Output: { success, enrichment_status, fields? }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const APIFY_BASE = 'https://api.apify.com/v2';
// Profile scraper actor (companion of harvestapi/linkedin-profile-posts).
const APIFY_PROFILE_ACTOR = 'harvestapi~linkedin-profile-scraper';

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function normaliseProfileUrl(raw: string): string {
  let url = raw.trim();
  if (!url.startsWith('http')) url = `https://${url}`;
  url = url.replace(/\/+$/, '').split('?')[0];
  if (!url.endsWith('/')) url += '/';
  return url;
}

function firstString(...vals: unknown[]): string | null {
  for (const v of vals) {
    if (typeof v === 'string' && v.trim().length > 0) return v.trim();
  }
  return null;
}

function pickAvatar(obj: Record<string, unknown>): string | null {
  const candidates: unknown[] = [
    obj.avatar,
    obj.profilePicture,
    obj.profilePictureUrl,
    obj.pictureUrl,
    obj.picture,
    obj.image,
    obj.imageUrl,
    obj.photo,
    obj.photoUrl,
    obj.profileImage,
    obj.profileImageUrl,
    (obj.avatar as Record<string, unknown> | undefined)?.url,
    (obj.profilePicture as Record<string, unknown> | undefined)?.url,
  ];
  for (const c of candidates) {
    if (typeof c === 'string' && c.startsWith('http')) return c;
  }
  return null;
}

async function persistAvatarToStorage(
  supabase: any,
  targetId: string,
  linkedinAvatarUrl: string,
): Promise<string | null> {
  try {
    const res = await fetch(linkedinAvatarUrl);
    if (!res.ok) {
      console.error('Avatar download failed:', res.status);
      return null;
    }
    const blob = await res.arrayBuffer();
    const contentType = res.headers.get('content-type') || 'image/jpeg';
    const ext = contentType.includes('png') ? 'png' : 'jpg';
    const filePath = `targets/${targetId}.${ext}`;

    const { error: uploadError } = await supabase.storage
      .from('publisher-avatars')
      .upload(filePath, blob, { contentType, upsert: true });

    if (uploadError) {
      console.error('Avatar upload failed:', uploadError);
      return null;
    }

    const { data: { publicUrl } } = supabase.storage
      .from('publisher-avatars')
      .getPublicUrl(filePath);

    return publicUrl;
  } catch (err) {
    console.error('persistAvatarToStorage error:', err);
    return null;
  }
}

// Run Apify profile scraper synchronously (run-sync) — returns dataset items
// directly. Caps at ~55s to stay within Edge Function timeout.
async function runProfileScraper(
  profileUrl: string,
  apifyToken: string,
): Promise<Record<string, unknown>[] | null> {
  // Start the run
  const startUrl = `${APIFY_BASE}/acts/${APIFY_PROFILE_ACTOR}/runs?token=${apifyToken}`;
  const startRes = await fetch(startUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      profileScraperMode: 'Profile details no email ($4 per 1k)',
      queries: [profileUrl],
      urls: [profileUrl],
    }),
  });
  if (!startRes.ok) {
    console.error('Apify start failed:', startRes.status, await startRes.text());
    return null;
  }
  const startData = await startRes.json();
  const runId = startData?.data?.id;
  const initialDatasetId = startData?.data?.defaultDatasetId;
  if (!runId) return null;
  console.log('Apify profile run started:', runId);

  // Poll
  const startTime = Date.now();
  let datasetId: string | null = initialDatasetId || null;
  while (Date.now() - startTime < 55000) {
    const r = await fetch(`${APIFY_BASE}/actor-runs/${runId}?token=${apifyToken}`);
    if (!r.ok) {
      console.error('Apify poll failed:', r.status);
      return null;
    }
    const j = await r.json();
    const status = j?.data?.status;
    datasetId = j?.data?.defaultDatasetId || datasetId;
    console.log(`Profile run ${runId} status: ${status}`);
    if (status === 'SUCCEEDED') break;
    if (status === 'FAILED' || status === 'TIMED-OUT' || status === 'ABORTED') {
      return null;
    }
    await sleep(2500);
  }
  if (!datasetId) return null;

  const itemsRes = await fetch(
    `${APIFY_BASE}/datasets/${datasetId}/items?token=${apifyToken}&format=json`,
  );
  if (!itemsRes.ok) {
    console.error('Apify dataset fetch failed:', itemsRes.status);
    return null;
  }
  const items = await itemsRes.json();
  console.log(`Profile dataset returned ${Array.isArray(items) ? items.length : 0} items`);
  if (Array.isArray(items) && items.length > 0) {
    console.log('First item keys:', Object.keys(items[0]));
  }
  return Array.isArray(items) ? items : [];
}

function extractProfileFields(
  item: Record<string, unknown>,
): {
  first_name: string | null;
  last_name: string | null;
  name: string | null;
  headline: string | null;
  title: string | null;
  company_name: string | null;
  avatar: string | null;
  username: string | null;
} {
  // Names
  let first = firstString(item.firstName, (item as any).first_name);
  let last = firstString(item.lastName, (item as any).last_name);
  const fullName = firstString(
    item.fullName,
    item.name,
    (item as any).displayName,
    first && last ? `${first} ${last}` : null,
  );
  if (!first && fullName) {
    const parts = fullName.split(/\s+/);
    first = parts[0] || null;
    last = parts.slice(1).join(' ') || null;
  }

  // Headline
  const headline = firstString(
    item.headline,
    (item as any).subtitle,
    (item as any).about,
  );

  // Current position
  const experiences =
    (item.experience as Record<string, unknown>[] | undefined) ||
    (item.experiences as Record<string, unknown>[] | undefined) ||
    (item.positions as Record<string, unknown>[] | undefined) ||
    [];
  const currentPosition = (item.currentPosition as Record<string, unknown> | undefined) ||
    (Array.isArray(experiences) ? experiences[0] : undefined) ||
    undefined;

  let title = firstString(
    item.jobTitle,
    (item as any).title,
    currentPosition?.title,
    currentPosition?.position,
    (currentPosition as any)?.jobTitle,
  );
  let company = firstString(
    (item as any).companyName,
    (item as any).company,
    currentPosition?.companyName,
    currentPosition?.company,
    (currentPosition as any)?.organization,
  );

  // If headline matches "Title at Company"
  if ((!title || !company) && headline) {
    const atMatch = headline.match(/^(.+?)\s+at\s+(.+)$/i);
    const pipeMatch = headline.match(/^(.+?)\s*[|·]\s*(.+)$/);
    if (atMatch) {
      title = title || atMatch[1].trim();
      company = company || atMatch[2].trim();
    } else if (pipeMatch) {
      title = title || pipeMatch[1].trim();
      company = company || pipeMatch[2].trim();
    }
  }

  const avatar = pickAvatar(item);
  const username = firstString(
    (item as any).publicIdentifier,
    (item as any).username,
    (item as any).vanityName,
    (item as any).publicId,
  );

  return {
    first_name: first,
    last_name: last,
    name: fullName,
    headline,
    title,
    company_name: company,
    avatar,
    username,
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { target_id } = await req.json();
    if (!target_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'target_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // Load target
    const { data: target, error: tErr } = await supabase
      .from('engagement_targets')
      .select('id, workspace_id, linkedin_url, linkedin_username, name')
      .eq('id', target_id)
      .single();

    if (tErr || !target) {
      return new Response(
        JSON.stringify({ success: false, error: 'Target not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // Mark pending
    await supabase
      .from('engagement_targets')
      .update({ enrichment_status: 'pending' })
      .eq('id', target_id);

    // Load workspace Apify token
    const { data: keyRow } = await supabase
      .from('workspace_api_keys')
      .select('api_key_encrypted')
      .eq('workspace_id', target.workspace_id)
      .eq('service_name', 'apify')
      .eq('is_valid', true)
      .maybeSingle();

    if (!keyRow?.api_key_encrypted) {
      await supabase
        .from('engagement_targets')
        .update({ enrichment_status: 'failed', enriched_at: new Date().toISOString() })
        .eq('id', target_id);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'No Apify API token configured for this workspace.',
          enrichment_status: 'failed',
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const apifyToken = keyRow.api_key_encrypted;
    const profileUrl = normaliseProfileUrl(target.linkedin_url);

    const items = await runProfileScraper(profileUrl, apifyToken);
    if (!items || items.length === 0) {
      await supabase
        .from('engagement_targets')
        .update({ enrichment_status: 'failed', enriched_at: new Date().toISOString() })
        .eq('id', target_id);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Apify returned no profile data.',
          enrichment_status: 'failed',
        }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const profile = extractProfileFields(items[0]);
    console.log('Extracted profile:', profile);

    // Persist avatar to our own storage so it survives LinkedIn CDN expiry
    let avatarUrl: string | null = null;
    if (profile.avatar) {
      avatarUrl = await persistAvatarToStorage(supabase, target.id, profile.avatar) || profile.avatar;
    }

    const update: Record<string, unknown> = {
      enrichment_status: 'succeeded',
      enriched_at: new Date().toISOString(),
    };
    if (profile.first_name) update.first_name = profile.first_name;
    if (profile.last_name) update.last_name = profile.last_name;
    if (profile.title) update.title = profile.title;
    if (profile.company_name) update.company_name = profile.company_name;
    if (profile.headline) update.headline = profile.headline;
    if (avatarUrl) update.avatar_url = avatarUrl;
    // Lowercase: linkedin_username carries the uniqueness constraint.
    if (profile.username && !target.linkedin_username) update.linkedin_username = profile.username.toLowerCase();

    // Overwrite name if user didn't enter a meaningful one (empty, equals URL, or equals username)
    const userName = (target.name || '').trim();
    const username = target.linkedin_username || profile.username || '';
    const shouldOverwriteName =
      !userName ||
      userName === username ||
      userName.toLowerCase() === target.linkedin_url.toLowerCase();
    if (profile.name && shouldOverwriteName) {
      update.name = profile.name;
    }

    const { error: updErr } = await supabase
      .from('engagement_targets')
      .update(update)
      .eq('id', target_id);

    if (updErr) {
      console.error('Update failed:', updErr);
      return new Response(
        JSON.stringify({ success: false, error: updErr.message, enrichment_status: 'failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, enrichment_status: 'succeeded', fields: update }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  } catch (err) {
    console.error('enrich-engagement-target error:', err);
    return new Response(
      JSON.stringify({ success: false, error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
