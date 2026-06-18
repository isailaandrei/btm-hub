-- Email studio redesign — Phase 1: content-addressed templates.
--
-- Every distinct email an admin sends is auto-saved as a reusable template,
-- deduplicated by a stable hash of its Maily document (body + layout). This
-- column stores that hash so the send path can find an existing template with
-- identical content instead of creating a duplicate. Nullable so historical
-- versions (created before this column existed) keep working; they simply never
-- match a dedup lookup.

ALTER TABLE email_template_versions
  ADD COLUMN content_hash text;

-- Partial index: dedup lookups always filter on a concrete hash, and most
-- historical rows are NULL, so only index the rows we actually query.
CREATE INDEX idx_email_template_versions_content_hash
  ON email_template_versions (content_hash)
  WHERE content_hash IS NOT NULL;
