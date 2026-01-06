-- Create section_edit_history table
CREATE TABLE public.section_edit_history (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  section_id uuid NOT NULL,
  document_id uuid NOT NULL,
  edited_by uuid,
  edited_by_email text NOT NULL,
  previous_content text NOT NULL,
  new_content text NOT NULL,
  previous_status text,
  new_status text,
  edited_at timestamp with time zone DEFAULT now() NOT NULL
);

-- Enable RLS
ALTER TABLE public.section_edit_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies (matching document_edit_history pattern)
CREATE POLICY "Admins can view section edit history"
  ON public.section_edit_history FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Anyone can insert section edit history"
  ON public.section_edit_history FOR INSERT
  WITH CHECK (true);