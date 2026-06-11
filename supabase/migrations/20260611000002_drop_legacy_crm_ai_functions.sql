-- Drop helper functions left behind after removing the derived CRM AI memory tables.

DROP FUNCTION IF EXISTS crm_ai_contact_dossiers_set_updated_at();
DROP FUNCTION IF EXISTS crm_ai_delete_embeddings_for_deleted_subchunk();
DROP FUNCTION IF EXISTS crm_ai_delete_subchunks_for_superseded_chunk();
DROP FUNCTION IF EXISTS crm_ai_evidence_subchunks_set_updated_at();
