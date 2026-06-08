// =============================================================================
// run-research — Intelligence Layer research pipeline
//
// Executes a research run for a publisher: fetches topics, queries Reddit / HN /
// Brave in parallel, normalises engagement scores, deduplicates, and stores
// results in intelligence_items.
//
// Input (JSON body):
//   { workspace_id, publisher_id, trigger_type?: "manual" | "scheduled" }
//
// Output:
//   { success, run_id, items_found, sources_used }
// =============================================================================

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface RawItem {
  source_type: 'reddit' | 'hackernews' | 'web';
  title: string;
  url: string;
  content_snippet: string | null;
  author: string | null;
  published_at: string | null;
  upvotes: number;
  comments_count: number;
  views: number;
  points: number;
  source_metadata: Record<string, unknown>;
}

// ---------------------------------------------------------------------------
// Source: Reddit  (public JSON API — no key required)
// ---------------------------------------------------------------------------

async function searchReddit(query: string): Promise<RawItem[]> {
  const items: RawItem[] = [];
  try {
    const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(query)}&sort=relevance&t=month&limit=25`;
    const res = await fetch(url, {
      headers: { 'User-Agent': 'social-scribe-safe/1.0' },
    });
    if (!res.ok) {
      console.error(`Reddit search failed (${res.status}) for "${query}"`);
      return items;
    }
    const data = await res.json();
    const posts = data?.data?.children ?? [];
    for (const child of posts) {
      const p = child.data;
      if (!p || !p.title || p.is_self === undefined) continue;
      items.push({
        source_type: 'reddit',
        title: p.title,
        url: `https://www.reddit.com${p.permalink}`,
        content_snippet: (p.selftext || '').slice(0, 500) || null,
        author: p.author || null,
        published_at: p.created_utc ? new Date(p.created_utc * 1000).toISOString() : null,
        upvotes: p.ups ?? 0,
        comments_count: p.num_comments ?? 0,
        views: 0,
        points: 0,
        source_metadata: {
          subreddit: p.subreddit,
          score: p.score,
          upvote_ratio: p.upvote_ratio,
          is_self: p.is_self,
        },
      });
    }
  } catch (err) {
    console.error('Reddit search error:', err);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Source: Hacker News  (Algolia search API — no key required)
// ---------------------------------------------------------------------------

async function searchHackerNews(query: string): Promise<RawItem[]> {
  const items: RawItem[] = [];
  try {
    // search_by_date for recency, filter to last 30 days
    const url = `https://hn.algolia.com/api/v1/search?query=${encodeURIComponent(query)}&tags=story&hitsPerPage=25`;
    const res = await fetch(url);
    if (!res.ok) {
      console.error(`HN search failed (${res.status}) for "${query}"`);
      return items;
    }
    const data = await res.json();
    const hits = data?.hits ?? [];
    for (const h of hits) {
      const hnUrl = h.url || `https://news.ycombinator.com/item?id=${h.objectID}`;
      items.push({
        source_type: 'hackernews',
        title: h.title || '',
        url: hnUrl,
        content_snippet: h.story_text ? h.story_text.slice(0, 500) : null,
        author: h.author || null,
        published_at: h.created_at || null,
        upvotes: 0,
        comments_count: h.num_comments ?? 0,
        views: 0,
        points: h.points ?? 0,
        source_metadata: {
          objectID: h.objectID,
          story_id: h.story_id,
        },
      });
    }
  } catch (err) {
    console.error('HN search error:', err);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Source: Brave Search  (requires API key — per-workspace)
// ---------------------------------------------------------------------------

async function searchBrave(query: string, apiKey: string): Promise<RawItem[]> {
  const items: RawItem[] = [];
  try {
    const url = `https://api.search.brave.com/res/v1/web/search?q=${encodeURIComponent(query)}&count=20&freshness=pm`;
    const res = await fetch(url, {
      headers: { 'X-Subscription-Token': apiKey, Accept: 'application/json' },
    });
    if (!res.ok) {
      console.error(`Brave search failed (${res.status}) for "${query}"`);
      return items;
    }
    const data = await res.json();
    const results = data?.web?.results ?? [];
    for (const r of results) {
      items.push({
        source_type: 'web',
        title: r.title || '',
        url: r.url,
        content_snippet: r.description ? r.description.slice(0, 500) : null,
        author: r.profile?.name || null,
        published_at: r.age ? null : null, // Brave doesn't give ISO dates reliably
        upvotes: 0,
        comments_count: 0,
        views: 0,
        points: 0,
        source_metadata: {
          favicon: r.profile?.img,
          site_name: r.meta_url?.hostname,
          language: r.language,
        },
      });
    }
  } catch (err) {
    console.error('Brave search error:', err);
  }
  return items;
}

// ---------------------------------------------------------------------------
// Engagement score normalisation
//
// Produces a 0-10000 composite score so items from different sources can be
// ranked on one axis.  Reddit upvotes dominate, HN points are weighted higher
// per-unit, web results get a flat base score.
// ---------------------------------------------------------------------------

function computeEngagementScore(item: RawItem): number {
  switch (item.source_type) {
    case 'reddit':
      // upvotes are the primary signal; comments add weight
      return Math.min(item.upvotes + item.comments_count * 2, 10000);
    case 'hackernews':
      // HN points are sparser — weight more heavily
      return Math.min(item.points * 3 + item.comments_count * 5, 10000);
    case 'web':
      // No engagement signals from Brave; rank by position (first = 100, decays)
      return 100;
    default:
      return 0;
  }
}

// ---------------------------------------------------------------------------
// Main handler
// ---------------------------------------------------------------------------

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { workspace_id, publisher_id, trigger_type = 'manual' } = await req.json();

    if (!workspace_id || !publisher_id) {
      return new Response(
        JSON.stringify({ success: false, error: 'workspace_id and publisher_id are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Supabase client (service role — bypasses RLS for writes) -----------
    const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.45.0');
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );

    // --- Fetch active monitoring topics for this publisher ------------------
    const { data: topics, error: topicsErr } = await supabase
      .from('monitoring_topics')
      .select('id, topic_type, topic_value')
      .eq('workspace_id', workspace_id)
      .eq('publisher_id', publisher_id)
      .eq('is_active', true);

    if (topicsErr) {
      console.error('Failed to fetch topics:', topicsErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to fetch monitoring topics' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    if (!topics || topics.length === 0) {
      return new Response(
        JSON.stringify({ success: true, run_id: null, items_found: 0, sources_used: [], message: 'No active monitoring topics configured' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Create research run record ----------------------------------------
    const { data: run, error: runErr } = await supabase
      .from('research_runs')
      .insert({
        workspace_id,
        publisher_id,
        status: 'running',
        trigger_type,
        topics_searched: topics.map((t: { topic_value: string }) => t.topic_value),
        started_at: new Date().toISOString(),
      })
      .select('id')
      .single();

    if (runErr || !run) {
      console.error('Failed to create research run:', runErr);
      return new Response(
        JSON.stringify({ success: false, error: 'Failed to create research run' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    // --- Resolve Brave API key (optional — per workspace) ------------------
    const { data: braveKeyRow } = await supabase
      .from('workspace_api_keys')
      .select('api_key_encrypted')
      .eq('workspace_id', workspace_id)
      .eq('service_name', 'brave')
      .eq('is_valid', true)
      .maybeSingle();

    const braveApiKey: string | null = braveKeyRow?.api_key_encrypted ?? null;

    // --- Run searches in parallel across all topics × sources ---------------
    const sourcesUsed: Set<string> = new Set();
    const allItems: (RawItem & { topic_id: string })[] = [];

    const searchPromises: Promise<void>[] = [];

    for (const topic of topics) {
      const q = topic.topic_value;

      // Reddit (always available)
      searchPromises.push(
        searchReddit(q).then((items) => {
          if (items.length > 0) sourcesUsed.add('reddit');
          for (const item of items) allItems.push({ ...item, topic_id: topic.id });
        }),
      );

      // Hacker News (always available)
      searchPromises.push(
        searchHackerNews(q).then((items) => {
          if (items.length > 0) sourcesUsed.add('hackernews');
          for (const item of items) allItems.push({ ...item, topic_id: topic.id });
        }),
      );

      // Brave (only if key configured)
      if (braveApiKey) {
        searchPromises.push(
          searchBrave(q, braveApiKey).then((items) => {
            if (items.length > 0) sourcesUsed.add('web');
            for (const item of items) allItems.push({ ...item, topic_id: topic.id });
          }),
        );
      }
    }

    await Promise.all(searchPromises);

    // --- Compute engagement scores -----------------------------------------
    for (const item of allItems) {
      (item as RawItem & { engagement_score: number }).engagement_score = computeEngagementScore(item);
    }

    // --- Deduplicate by URL (keep highest engagement) ----------------------
    const urlMap = new Map<string, (typeof allItems)[0] & { engagement_score: number }>();
    for (const item of allItems) {
      const scored = item as typeof item & { engagement_score: number };
      const existing = urlMap.get(item.url);
      if (!existing || scored.engagement_score > existing.engagement_score) {
        urlMap.set(item.url, scored);
      }
    }
    const dedupedItems = Array.from(urlMap.values());

    // --- Upsert into intelligence_items (ON CONFLICT workspace_id, url) ----
    let itemsInserted = 0;
    if (dedupedItems.length > 0) {
      // Batch in chunks of 50 to stay within payload limits
      const BATCH_SIZE = 50;
      for (let i = 0; i < dedupedItems.length; i += BATCH_SIZE) {
        const batch = dedupedItems.slice(i, i + BATCH_SIZE).map((item) => ({
          workspace_id,
          publisher_id,
          research_run_id: run.id,
          topic_id: item.topic_id,
          source_type: item.source_type,
          title: item.title,
          url: item.url,
          content_snippet: item.content_snippet,
          author: item.author,
          published_at: item.published_at,
          engagement_score: item.engagement_score,
          upvotes: item.upvotes,
          comments_count: item.comments_count,
          views: item.views,
          points: item.points,
          source_metadata: item.source_metadata,
        }));

        const { data: inserted, error: insertErr } = await supabase
          .from('intelligence_items')
          .upsert(batch, {
            onConflict: 'workspace_id,url',
            ignoreDuplicates: false, // update engagement if re-seen
          })
          .select('id');

        if (insertErr) {
          console.error('Batch insert error:', insertErr);
        } else {
          itemsInserted += inserted?.length ?? 0;
        }
      }
    }

    // --- Mark run as completed ---------------------------------------------
    const sourcesArr = Array.from(sourcesUsed);
    await supabase
      .from('research_runs')
      .update({
        status: 'completed',
        items_found: itemsInserted,
        sources_used: sourcesArr,
        completed_at: new Date().toISOString(),
      })
      .eq('id', run.id);

    console.log(`Research run ${run.id}: ${itemsInserted} items from [${sourcesArr.join(', ')}]`);

    return new Response(
      JSON.stringify({
        success: true,
        run_id: run.id,
        items_found: itemsInserted,
        sources_used: sourcesArr,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error: unknown) {
    console.error('run-research error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Research run failed';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
