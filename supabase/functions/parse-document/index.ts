import { JSZip } from "https://deno.land/x/jszip@0.11.0/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Parse PDF file - extract text content
async function parsePdf(arrayBuffer: ArrayBuffer): Promise<string> {
  // Convert to Uint8Array for processing
  const bytes = new Uint8Array(arrayBuffer);
  const text = new TextDecoder('latin1').decode(bytes);
  
  // Extract text from PDF streams
  const extractedParts: string[] = [];
  
  // Method 1: Extract text between BT (Begin Text) and ET (End Text) operators
  const btEtRegex = /BT\s([\s\S]*?)ET/g;
  let match;
  
  while ((match = btEtRegex.exec(text)) !== null) {
    const block = match[1];
    
    // Extract text from Tj operator (show text)
    const tjMatches = block.match(/\(([^)]*)\)\s*Tj/g);
    if (tjMatches) {
      for (const tj of tjMatches) {
        const textMatch = tj.match(/\(([^)]*)\)/);
        if (textMatch) {
          extractedParts.push(decodePdfText(textMatch[1]));
        }
      }
    }
    
    // Extract text from TJ operator (show text with positioning)
    const tjArrayRegex = /\[(.*?)\]\s*TJ/g;
    let tjArrayMatch;
    while ((tjArrayMatch = tjArrayRegex.exec(block)) !== null) {
      const arr = tjArrayMatch[1];
      const textParts = arr.match(/\(([^)]*)\)/g);
      if (textParts) {
        const lineText = textParts
          .map(p => decodePdfText(p.slice(1, -1)))
          .join('');
        extractedParts.push(lineText);
      }
    }
  }

  // Method 2: If BT/ET extraction yields little, try stream decompression
  if (extractedParts.join('').trim().length < 100) {
    // Try to find and extract raw text content patterns
    const textPatterns = text.match(/\(([^\\)]{3,})\)/g);
    if (textPatterns) {
      for (const tp of textPatterns) {
        const inner = tp.slice(1, -1);
        // Filter out binary/control sequences
        if (/^[\x20-\x7e\s]{3,}$/.test(inner) && !/^[A-Z]{2,}\s/.test(inner)) {
          extractedParts.push(decodePdfText(inner));
        }
      }
    }
  }

  let result = extractedParts
    .join(' ')
    .replace(/\s+/g, ' ')
    .replace(/([.!?])\s/g, '$1\n')
    .trim();

  // If native extraction failed, try using Lovable AI to extract via OCR-like approach
  if (result.length < 50) {
    console.log('Native PDF extraction yielded little text, using AI gateway for extraction');
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (LOVABLE_API_KEY) {
      // Convert first portion to base64 for AI processing
      const base64 = btoa(String.fromCharCode(...bytes.slice(0, 500000)));
      
      try {
        const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${LOVABLE_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            model: 'google/gemini-2.5-flash',
            messages: [
              {
                role: 'user',
                content: [
                  {
                    type: 'text',
                    text: 'Extract ALL text content from this PDF document. Return only the extracted text, preserving paragraphs and structure. Do not add any commentary.',
                  },
                  {
                    type: 'image_url',
                    image_url: {
                      url: `data:application/pdf;base64,${base64}`,
                    },
                  },
                ],
              },
            ],
          }),
        });

        if (aiResponse.ok) {
          const aiData = await aiResponse.json();
          const aiText = aiData.choices?.[0]?.message?.content;
          if (aiText && aiText.length > result.length) {
            result = aiText;
          }
        }
      } catch (e) {
        console.warn('AI PDF extraction failed:', e);
      }
    }
  }

  if (result.length < 10) {
    throw new Error('Could not extract meaningful text from PDF. The file may be image-based or encrypted.');
  }

  return result;
}

function decodePdfText(text: string): string {
  return text
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\(/g, '(')
    .replace(/\\\)/g, ')')
    .replace(/\\\\/g, '\\');
}

// Parse DOCX file (it's a ZIP containing XML)
async function parseDocx(arrayBuffer: ArrayBuffer): Promise<string> {
  const zip = new JSZip();
  await zip.loadAsync(arrayBuffer);
  
  const documentXml = await zip.file("word/document.xml")?.async("string");
  if (!documentXml) {
    throw new Error("Invalid DOCX file: missing document.xml");
  }
  
  let text = documentXml
    .replace(/<\/w:p>/g, '\n')
    .replace(/<w:br[^>]*\/>/g, '\n')
    .replace(/<w:tab[^>]*\/>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
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
  
  const firstLine = lines[0].toLowerCase();
  const hasHeader = firstLine.includes('post') || firstLine.includes('content') || firstLine.includes('text');
  
  const dataLines = hasHeader ? lines.slice(1) : lines;
  
  const posts = dataLines.map((line, index) => {
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
    
    const content = values.find(v => v && v.length > 0) || '';
    
    return `Post ${index + 1}: ${content}`;
  }).filter(post => post.length > 10);
  
  return posts.join('\n\n');
}

Deno.serve(async (req) => {
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
    
    if (fileName.endsWith('.pdf')) {
      const arrayBuffer = await file.arrayBuffer();
      content = await parsePdf(arrayBuffer);
      console.log('PDF parsed successfully, length:', content.length);
    } else if (fileName.endsWith('.docx')) {
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
        JSON.stringify({ success: false, error: 'Unsupported file type. Use .pdf, .docx, .csv, .txt, or .md' }),
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
