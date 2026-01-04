import { supabase } from '@/integrations/supabase/client';

export interface LinkedInProfile {
  name: string;
  title: string;
  imageUrl: string;
  sourceUrl: string;
}

export async function scrapeLinkedInProfile(url: string): Promise<{ success: boolean; data?: LinkedInProfile; error?: string }> {
  try {
    const { data, error } = await supabase.functions.invoke('scrape-linkedin', {
      body: { url },
    });

    if (error) {
      console.error('Error invoking scrape-linkedin:', error);
      return { success: false, error: error.message };
    }

    return data;
  } catch (error) {
    console.error('Error scraping LinkedIn:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}
