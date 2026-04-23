-- ---------------------------------------------------------------------------
-- Admin AI hybrid memory — Phase 4: vector search over evidence subchunks
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.search_admin_ai_subchunk_evidence(
  p_query_embedding extensions.vector(1536),
  p_contact_ids uuid[] DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  subchunk_id uuid,
  evidence_id uuid,
  contact_id uuid,
  application_id uuid,
  source_type text,
  source_id text,
  source_label text,
  source_timestamp timestamptz,
  program text,
  text text,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  WITH ranked_matches AS (
    SELECT
      subchunk.id AS subchunk_id,
      parent.id AS evidence_id,
      parent.contact_id,
      parent.application_id,
      parent.source_type,
      parent.source_id,
      COALESCE(parent.metadata_json->>'sourceLabel', parent.source_type) AS source_label,
      parent.source_timestamp,
      parent.metadata_json->>'program' AS program,
      parent.text,
      1 - (embedding.embedding OPERATOR(extensions.<=>) p_query_embedding) AS similarity,
      ROW_NUMBER() OVER (
        PARTITION BY parent.id
        ORDER BY embedding.embedding OPERATOR(extensions.<=>) p_query_embedding ASC, subchunk.subchunk_index ASC
      ) AS evidence_rank
    FROM crm_ai_embeddings embedding
    JOIN crm_ai_evidence_subchunks subchunk
      ON embedding.target_type = 'subchunk'
     AND embedding.target_id = subchunk.id
    JOIN crm_ai_evidence_chunks parent
      ON parent.id = subchunk.parent_chunk_id
    WHERE embedding.embedding IS NOT NULL
      AND parent.superseded_at IS NULL
      AND (
        p_contact_id IS NULL
        OR parent.contact_id = p_contact_id
      )
      AND (
        p_contact_ids IS NULL
        OR cardinality(p_contact_ids) = 0
        OR parent.contact_id = ANY(p_contact_ids)
      )
  )
  SELECT
    ranked_matches.subchunk_id,
    ranked_matches.evidence_id,
    ranked_matches.contact_id,
    ranked_matches.application_id,
    ranked_matches.source_type,
    ranked_matches.source_id,
    ranked_matches.source_label,
    ranked_matches.source_timestamp,
    ranked_matches.program,
    ranked_matches.text,
    ranked_matches.similarity
  FROM ranked_matches
  WHERE ranked_matches.evidence_rank = 1
  ORDER BY ranked_matches.similarity DESC, ranked_matches.evidence_id ASC
  LIMIT GREATEST(COALESCE(p_limit, 40), 1);
$$;

GRANT EXECUTE ON FUNCTION public.search_admin_ai_subchunk_evidence(
  extensions.vector(1536),
  uuid[],
  uuid,
  integer
) TO authenticated;
