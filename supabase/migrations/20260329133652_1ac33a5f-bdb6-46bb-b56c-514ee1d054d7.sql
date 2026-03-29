ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS appendix text DEFAULT NULL;
ALTER TABLE public.document_sections ADD COLUMN IF NOT EXISTS appendix text DEFAULT NULL;