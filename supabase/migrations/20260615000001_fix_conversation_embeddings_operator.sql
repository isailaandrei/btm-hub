-- Qualify pgvector's distance operator so the RPC resolves correctly when
-- callers have a restricted or unexpected search_path. This is intentionally a
-- forward migration because 20260611000001 may already be applied remotely.

CREATE OR REPLACE FUNCTION public.search_conversation_embeddings(
  p_query_embedding extensions.vector(1536),
  p_contact_id uuid DEFAULT NULL,
  p_limit integer DEFAULT 40
)
RETURNS TABLE (
  message_id uuid,
  contact_id uuid,
  body text,
  happened_at timestamptz,
  similarity double precision
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    message.id AS message_id,
    message.contact_id,
    message.body,
    message.happened_at,
    1 - (embedding.embedding OPERATOR(extensions.<=>) p_query_embedding) AS similarity
  FROM public.conversation_embeddings embedding
  JOIN public.conversation_messages message
    ON message.id = embedding.target_id
  WHERE embedding.target_type = 'message'
    AND (p_contact_id IS NULL OR message.contact_id = p_contact_id)
  ORDER BY embedding.embedding OPERATOR(extensions.<=>) p_query_embedding
  LIMIT p_limit;
$$;

GRANT EXECUTE ON FUNCTION public.search_conversation_embeddings(
  extensions.vector(1536),
  uuid,
  integer
) TO authenticated;
