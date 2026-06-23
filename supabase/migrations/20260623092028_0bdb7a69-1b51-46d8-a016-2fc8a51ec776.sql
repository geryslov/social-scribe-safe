CREATE POLICY "Workspace creators can update document sections"
ON public.document_sections
FOR UPDATE
USING (public.user_can_create_document_section(document_id))
WITH CHECK (public.user_can_create_document_section(document_id));

CREATE POLICY "Workspace creators can delete document sections"
ON public.document_sections
FOR DELETE
USING (public.user_can_create_document_section(document_id));