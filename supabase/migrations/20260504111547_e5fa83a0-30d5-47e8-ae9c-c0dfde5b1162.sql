CREATE OR REPLACE FUNCTION public.user_can_create_in_workspace(_workspace_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT public.has_role(auth.uid(), 'admin'::app_role)
    OR EXISTS (
      SELECT 1
      FROM public.workspace_members wm
      WHERE wm.user_id = auth.uid()
        AND wm.workspace_id = _workspace_id
        AND wm.role IN ('admin', 'creator')
    )
$$;

CREATE OR REPLACE FUNCTION public.user_can_create_document_section(_document_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = _document_id
      AND d.workspace_id IS NOT NULL
      AND public.user_can_create_in_workspace(d.workspace_id)
  )
$$;

DROP POLICY IF EXISTS "Workspace creators can create documents" ON public.documents;
CREATE POLICY "Workspace creators can create documents"
ON public.documents
FOR INSERT
TO authenticated
WITH CHECK (
  workspace_id IS NOT NULL
  AND created_by = auth.uid()
  AND public.user_can_create_in_workspace(workspace_id)
);

DROP POLICY IF EXISTS "Workspace creators can update own documents" ON public.documents;
CREATE POLICY "Workspace creators can update own documents"
ON public.documents
FOR UPDATE
TO authenticated
USING (
  workspace_id IS NOT NULL
  AND created_by = auth.uid()
  AND public.user_can_create_in_workspace(workspace_id)
)
WITH CHECK (
  workspace_id IS NOT NULL
  AND created_by = auth.uid()
  AND public.user_can_create_in_workspace(workspace_id)
);

DROP POLICY IF EXISTS "Workspace creators can create document sections" ON public.document_sections;
CREATE POLICY "Workspace creators can create document sections"
ON public.document_sections
FOR INSERT
TO authenticated
WITH CHECK (public.user_can_create_document_section(document_id));

DROP POLICY IF EXISTS "Workspace creators can create posts" ON public.posts;
CREATE POLICY "Workspace creators can create posts"
ON public.posts
FOR INSERT
TO authenticated
WITH CHECK (
  workspace_id IS NOT NULL
  AND created_by = auth.uid()
  AND public.user_can_create_in_workspace(workspace_id)
);