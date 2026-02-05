-- Add publisher_id column to document_sections table
ALTER TABLE public.document_sections 
ADD COLUMN publisher_id uuid REFERENCES public.publishers(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_document_sections_publisher_id ON public.document_sections(publisher_id);