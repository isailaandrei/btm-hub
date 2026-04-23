-- ---------------------------------------------------------------------------
-- Admin AI memory cleanup hardening
-- ---------------------------------------------------------------------------
--
-- Fixes:
--   1. superseded current chunk rows now clean up their retrieval-only
--      subchunks, which in turn clean up subchunk-targeted embeddings
--   2. vector search function now states SECURITY INVOKER explicitly

-- ---------------------------------------------------------------------------
-- Cleanup retrieval-only children for superseded chunk versions
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION crm_ai_delete_embeddings_for_deleted_subchunk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM crm_ai_embeddings
  WHERE target_type = 'subchunk'
    AND target_id = OLD.id;

  RETURN OLD;
END;
$$;

DROP TRIGGER IF EXISTS crm_ai_evidence_subchunks_cleanup_embeddings_trg
  ON crm_ai_evidence_subchunks;

CREATE TRIGGER crm_ai_evidence_subchunks_cleanup_embeddings_trg
  AFTER DELETE ON crm_ai_evidence_subchunks
  FOR EACH ROW
  EXECUTE FUNCTION crm_ai_delete_embeddings_for_deleted_subchunk();

CREATE OR REPLACE FUNCTION crm_ai_delete_subchunks_for_superseded_chunk()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  DELETE FROM crm_ai_evidence_subchunks
  WHERE parent_chunk_id = NEW.id;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS crm_ai_evidence_chunks_cleanup_subchunks_on_supersede_trg
  ON crm_ai_evidence_chunks;

CREATE TRIGGER crm_ai_evidence_chunks_cleanup_subchunks_on_supersede_trg
  AFTER UPDATE OF superseded_at ON crm_ai_evidence_chunks
  FOR EACH ROW
  WHEN (OLD.superseded_at IS NULL AND NEW.superseded_at IS NOT NULL)
  EXECUTE FUNCTION crm_ai_delete_subchunks_for_superseded_chunk();

COMMENT ON FUNCTION crm_ai_delete_subchunks_for_superseded_chunk()
  IS 'Deletes retrieval-only crm_ai_evidence_subchunks rows when a current crm_ai_evidence_chunks row is superseded.';

COMMENT ON FUNCTION crm_ai_delete_embeddings_for_deleted_subchunk()
  IS 'Deletes crm_ai_embeddings rows targeting subchunks that have been removed from the retrieval surface.';

-- ---------------------------------------------------------------------------
-- Make vector-search function security stance explicit
-- ---------------------------------------------------------------------------

ALTER FUNCTION public.search_admin_ai_subchunk_evidence(
  extensions.vector(1536),
  uuid[],
  uuid,
  integer
) SECURITY INVOKER;

COMMENT ON FUNCTION public.search_admin_ai_subchunk_evidence(
  extensions.vector(1536),
  uuid[],
  uuid,
  integer
)
  IS 'Admin AI vector retrieval over current crm_ai_evidence_subchunks rows (via current parent chunks only). SECURITY INVOKER so caller RLS remains authoritative.';
