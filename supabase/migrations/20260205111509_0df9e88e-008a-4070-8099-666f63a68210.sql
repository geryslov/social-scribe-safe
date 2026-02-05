-- Add publisher_id column to documents table
ALTER TABLE public.documents 
ADD COLUMN publisher_id uuid REFERENCES public.publishers(id) ON DELETE SET NULL;

-- Create index for better query performance
CREATE INDEX idx_documents_publisher_id ON public.documents(publisher_id);