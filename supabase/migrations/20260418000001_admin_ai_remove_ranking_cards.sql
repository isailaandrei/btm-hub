-- Remove the legacy ranking-card layer now that global shortlist
-- reasoning runs directly over dossier projections.

DO $$
BEGIN
  IF to_regclass('public.crm_ai_contact_ranking_cards') IS NOT NULL THEN
    DROP TRIGGER IF EXISTS crm_ai_contact_ranking_cards_set_updated_at_trg
      ON crm_ai_contact_ranking_cards;
  END IF;
END $$;

DROP FUNCTION IF EXISTS crm_ai_contact_ranking_cards_set_updated_at();
DROP TABLE IF EXISTS crm_ai_contact_ranking_cards;

CREATE OR REPLACE FUNCTION find_stale_admin_ai_contact_memory(
  p_limit int DEFAULT 100
)
RETURNS TABLE (contact_id uuid)
LANGUAGE sql
STABLE
AS $$
  SELECT DISTINCT c.contact_id
  FROM (
    SELECT chunk.contact_id
    FROM crm_ai_evidence_chunks chunk
    WHERE NOT EXISTS (
      SELECT 1
      FROM crm_ai_contact_dossiers dossier
      WHERE dossier.contact_id = chunk.contact_id
    )

    UNION

    SELECT dossier.contact_id
    FROM crm_ai_contact_dossiers dossier
    WHERE dossier.stale_at IS NOT NULL AND dossier.stale_at <= now()
  ) c
  LIMIT GREATEST(COALESCE(p_limit, 100), 1);
$$;

GRANT EXECUTE ON FUNCTION find_stale_admin_ai_contact_memory(int) TO authenticated;
