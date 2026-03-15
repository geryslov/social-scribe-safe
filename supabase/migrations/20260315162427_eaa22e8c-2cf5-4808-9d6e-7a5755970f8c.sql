-- Fix document_comments RLS policies
DROP POLICY "Anyone can view comments" ON public.document_comments;
DROP POLICY "Anyone can add comments" ON public.document_comments;

-- SELECT: only authenticated users who have access to the document's workspace
CREATE POLICY "Authenticated users can view comments in their workspaces"
ON public.document_comments
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.documents d
    WHERE d.id = document_comments.document_id
    AND (d.workspace_id IS NULL OR user_has_workspace_access(d.workspace_id))
  )
);

-- INSERT: must be authenticated and user_id must match auth.uid()
CREATE POLICY "Authenticated users can add comments"
ON public.document_comments
FOR INSERT
TO authenticated
WITH CHECK (
  auth.uid() = user_id
);