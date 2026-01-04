const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { url } = await req.json();

    if (!url) {
      return new Response(
        JSON.stringify({ success: false, error: 'LinkedIn URL is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const apiKey = Deno.env.get('FIRECRAWL_API_KEY');
    if (!apiKey) {
      console.error('FIRECRAWL_API_KEY not configured');
      return new Response(
        JSON.stringify({ success: false, error: 'Firecrawl not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Format URL
    let formattedUrl = url.trim();
    if (!formattedUrl.startsWith('http://') && !formattedUrl.startsWith('https://')) {
      formattedUrl = `https://${formattedUrl}`;
    }
    
    // Ensure URL ends properly for profile base
    const profileBaseUrl = formattedUrl.replace(/\/+$/, '');
    
    // Create photo overlay URL for better image extraction
    const photoOverlayUrl = `${profileBaseUrl}/overlay/photo/`;

    console.log('Scraping LinkedIn profile:', formattedUrl);
    console.log('Photo overlay URL:', photoOverlayUrl);

    // First, scrape the main profile
    const response = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url: formattedUrl,
        formats: ['markdown', 'html'],
        onlyMainContent: true,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('Firecrawl API error:', data);
      return new Response(
        JSON.stringify({ success: false, error: data.error || 'Failed to scrape profile' }),
        { status: response.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Extract profile info from the scraped data
    const markdown = data.data?.markdown || data.markdown || '';
    const metadata = data.data?.metadata || data.metadata || {};
    
    // Try to extract name from title or first heading
    let name = '';
    let title = '';
    
    // Extract from page title (usually "Name - Title | LinkedIn")
    if (metadata.title) {
      const titleParts = metadata.title.split(' - ');
      if (titleParts.length >= 1) {
        name = titleParts[0].trim();
      }
      if (titleParts.length >= 2) {
        // Remove "| LinkedIn" suffix
        title = titleParts[1].replace(/\s*\|\s*LinkedIn.*$/i, '').trim();
      }
    }
    
    // Try to extract from markdown if not found
    if (!name && markdown) {
      // Look for first heading that looks like a name
      const nameMatch = markdown.match(/^#\s+(.+?)$/m);
      if (nameMatch) {
        name = nameMatch[1].trim();
      }
    }
    
    // Try to extract image URL from metadata
    let imageUrl = metadata.ogImage || '';
    
    // If no image or low-quality image, try the photo overlay URL
    if (!imageUrl || imageUrl.includes('shrink_100') || imageUrl.includes('shrink_200')) {
      console.log('Attempting to get higher quality image from photo overlay URL');
      try {
        const photoResponse = await fetch('https://api.firecrawl.dev/v1/scrape', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            url: photoOverlayUrl,
            formats: ['html'],
            onlyMainContent: false,
          }),
        });
        
        if (photoResponse.ok) {
          const photoData = await photoResponse.json();
          const photoMetadata = photoData.data?.metadata || photoData.metadata || {};
          const betterImage = photoMetadata.ogImage || '';
          
          // LinkedIn photo overlay pages often have higher resolution images
          if (betterImage && betterImage.length > 0) {
            console.log('Found better image from photo overlay:', betterImage);
            imageUrl = betterImage;
          }
        }
      } catch (photoError) {
        console.log('Could not fetch photo overlay, using original image:', photoError);
      }
    }
    
    console.log('Extracted profile info:', { name, title, imageUrl });

    return new Response(
      JSON.stringify({
        success: true,
        data: {
          name,
          title,
          imageUrl,
          sourceUrl: formattedUrl,
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error scraping LinkedIn profile:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to scrape profile';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
