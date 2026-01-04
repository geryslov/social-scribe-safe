-- Create a table to store document sections for individual review/editing
CREATE TABLE public.document_sections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  section_number INTEGER NOT NULL,
  content TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.document_sections ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Anyone can view document sections" 
ON public.document_sections 
FOR SELECT 
USING (true);

CREATE POLICY "Admins can create document sections" 
ON public.document_sections 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update document sections" 
ON public.document_sections 
FOR UPDATE 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete document sections" 
ON public.document_sections 
FOR DELETE 
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_document_sections_updated_at
BEFORE UPDATE ON public.document_sections
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_document_sections_document_id ON public.document_sections(document_id);