import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse DOCX file (it's a ZIP containing XML)
async function parseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = new JSZip();
  await zip.loadAsync(arrayBuffer);
  
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) {
    throw new Error("Invalid DOCX file: missing document.xml");
  }
  
  // Extract text content from XML
  // Remove XML tags and get text content
  let text = documentXml
    // Replace paragraph endings with newlines
    .replace(/<\/w:p>/g, '\n')
    // Replace line breaks
    .replace(/<w:br[^>]*\/>/g, '\n')
    // Replace tabs
    .replace(/<w:tab[^>]*\/>/g, '\t')
    // Remove all XML tags
    .replace(/<[^>]+>/g, '')
    // Decode common XML entities
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    // Clean up excessive whitespace
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  
  return text;
}

// Parse CSV file
function parseCsv(text: string): string {
  const lines = text.split('\n').filter(line => line.trim());
  
  if (lines.length === 0) {
    return '';
  }
  
  // Try to detect if first row is a header
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('post') || firstLine.includes('content') || firstLine.includes('text');
  
  const dataLines = hasHeader ? lines.slice(1) : lines;
  
  // Convert CSV rows to post format
  const posts = dataLines.map((line, index) => {
    // Simple CSV parsing (handles quoted values)
    const values: string[] = [];
    let current = '';
    let inQuotes = false;
    
    for (let i = 0; i < line.length; i++) {
      const char = line[i];
      if (char === '"') {
        inQuotes = !inQuotes;
      } else if (char === ',' && !inQuotes) {
        values.push(current.trim());
        current = '';
      } else {
        current += char;
      }
    }
    values.push(current.trim());
    
    // Use the first non-empty column as post content
    const content = values.find(v => v && v.length > 0) || '';
    
    return `Post ${index + 1}: ${content}`;
  }).filter(post => post.length > 10); // Filter out empty posts
  
  return posts.join('\n\n');
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get('file') as File;
    
    if (!file) {
      return new Response(
        JSON.stringify({ success: false, error: 'No file provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Parsing file: ${file.name}, type: ${file.type}, size: ${file.size}`);
    
    const fileName = file.name.toLowerCase();
    let content = '';
    
    if (fileName.endsWith('.docx')) {
      const arrayBuffer = await file.arrayBuffer();
      content = await parseDocx(arrayBuffer);
      console.log('DOCX parsed successfully');
    } else if (fileName.endsWith('.csv')) {
      const text = await file.text();
      content = parseCsv(text);
      console.log('CSV parsed successfully');
    } else if (fileName.endsWith('.txt') || fileName.endsWith('.md')) {
      content = await file.text();
      console.log('Text file read successfully');
    } else {
      return new Response(
        JSON.stringify({ success: false, error: 'Unsupported file type. Use .docx, .csv, .txt, or .md' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, content }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error parsing document:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse document';
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
