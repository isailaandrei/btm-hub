ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS import_source text;

ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS import_submission_id text;

ALTER TABLE public.applications
ADD COLUMN IF NOT EXISTS import_content_hash text;

CREATE UNIQUE INDEX IF NOT EXISTS idx_applications_import_submission_id
ON public.applications (import_submission_id)
WHERE import_submission_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_import_source
ON public.applications (import_source)
WHERE import_source IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_program_submitted_at_unimported
ON public.applications (program, submitted_at)
WHERE import_submission_id IS NULL;
