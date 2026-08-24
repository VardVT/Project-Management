-- Drawing markup system: drawings + annotations + storage bucket
-- Run in Supabase SQL Editor after 011_task_completed_at.sql
-- Note: public.tasks.drawing_id (text) remains the Excel drawing number.
--       public.drawings is a separate PDF/markup entity.

CREATE TABLE IF NOT EXISTS public.drawings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  project_id UUID NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  file_path TEXT,
  file_size INT,
  file_type TEXT DEFAULT 'pdf',
  version TEXT DEFAULT 'Rev 1',
  page_count INT DEFAULT 1,
  status TEXT DEFAULT 'in_review',
  metadata JSONB DEFAULT '{}'::jsonb,
  archived_at TIMESTAMPTZ,
  archived_by UUID REFERENCES public.profiles(id),
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.drawing_annotations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  drawing_id UUID NOT NULL REFERENCES public.drawings(id) ON DELETE CASCADE,
  page_number INT NOT NULL DEFAULT 1,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  type TEXT NOT NULL,
  x_percent NUMERIC(6,3) NOT NULL,
  y_percent NUMERIC(6,3) NOT NULL,
  vector_data JSONB DEFAULT '{}'::jsonb,
  color TEXT DEFAULT '#EF4444',
  label TEXT,
  created_by UUID REFERENCES public.profiles(id),
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_drawings_project_id ON public.drawings(project_id);
CREATE INDEX IF NOT EXISTS idx_drawings_status ON public.drawings(status);
CREATE INDEX IF NOT EXISTS idx_annotations_drawing_id ON public.drawing_annotations(drawing_id);
CREATE INDEX IF NOT EXISTS idx_annotations_task_id ON public.drawing_annotations(task_id);

ALTER TABLE public.drawings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.drawing_annotations ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "drawings_select_authenticated" ON public.drawings;
CREATE POLICY "drawings_select_authenticated"
  ON public.drawings FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "drawings_insert_authenticated" ON public.drawings;
CREATE POLICY "drawings_insert_authenticated"
  ON public.drawings FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "drawings_update_authenticated" ON public.drawings;
CREATE POLICY "drawings_update_authenticated"
  ON public.drawings FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "drawings_delete_manager" ON public.drawings;
CREATE POLICY "drawings_delete_manager"
  ON public.drawings FOR DELETE
  TO authenticated
  USING (public.is_manager_or_admin() OR created_by = auth.uid());

DROP POLICY IF EXISTS "annotations_select_authenticated" ON public.drawing_annotations;
CREATE POLICY "annotations_select_authenticated"
  ON public.drawing_annotations FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "annotations_insert_authenticated" ON public.drawing_annotations;
CREATE POLICY "annotations_insert_authenticated"
  ON public.drawing_annotations FOR INSERT
  TO authenticated
  WITH CHECK (created_by = auth.uid());

DROP POLICY IF EXISTS "annotations_update_authenticated" ON public.drawing_annotations;
CREATE POLICY "annotations_update_authenticated"
  ON public.drawing_annotations FOR UPDATE
  TO authenticated
  USING (true)
  WITH CHECK (true);

DROP POLICY IF EXISTS "annotations_delete_authenticated" ON public.drawing_annotations;
CREATE POLICY "annotations_delete_authenticated"
  ON public.drawing_annotations FOR DELETE
  TO authenticated
  USING (public.is_manager_or_admin() OR created_by = auth.uid());

-- Storage bucket for project PDFs (public read; authenticated write under project folder)
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'project-drawings',
  'project-drawings',
  true,
  52428800, -- 50 MB
  ARRAY['application/pdf', 'image/png', 'image/jpeg', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

DROP POLICY IF EXISTS "project_drawings_public_read" ON storage.objects;
CREATE POLICY "project_drawings_public_read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'project-drawings');

DROP POLICY IF EXISTS "project_drawings_auth_insert" ON storage.objects;
CREATE POLICY "project_drawings_auth_insert"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'project-drawings');

DROP POLICY IF EXISTS "project_drawings_auth_update" ON storage.objects;
CREATE POLICY "project_drawings_auth_update"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'project-drawings')
  WITH CHECK (bucket_id = 'project-drawings');

DROP POLICY IF EXISTS "project_drawings_auth_delete" ON storage.objects;
CREATE POLICY "project_drawings_auth_delete"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'project-drawings');

NOTIFY pgrst, 'reload schema';
