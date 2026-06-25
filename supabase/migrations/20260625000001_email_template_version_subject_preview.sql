-- Templates now remember the subject + preview text they were saved with, so
-- starting a new email from a template restores those alongside the design
-- (previously only the Maily document was reused; subject/preview reset to
-- defaults). Stored per version because they are part of the content snapshot:
-- "Update current" creates a new version and should capture the current values.
ALTER TABLE email_template_versions
  ADD COLUMN IF NOT EXISTS subject_template text NOT NULL DEFAULT ''
    CHECK (char_length(subject_template) <= 200),
  ADD COLUMN IF NOT EXISTS preview_text text NOT NULL DEFAULT ''
    CHECK (char_length(preview_text) <= 200);

-- Backfill existing versions from the most recent send that used each one, so
-- already-saved templates aren't blank on first load. Best-effort: versions that
-- were never sent keep the empty default and fall back to the composer defaults.
UPDATE email_template_versions v
SET
  subject_template = s.subject_template,
  preview_text = s.preview_text
FROM (
  SELECT DISTINCT ON (template_version_id)
    template_version_id,
    subject_template,
    preview_text
  FROM email_sends
  WHERE template_version_id IS NOT NULL
  ORDER BY template_version_id, created_at DESC
) s
WHERE v.id = s.template_version_id
  AND v.subject_template = '';
