-- Restore `conversation_current_facts` (+ its partial index) on the remote.
--
-- Both were defined in 20260611000001, and prod's migration ledger marks that
-- migration applied — but the view does not exist there (verified Jul 8:
-- pg_class has no relkind 'v' for it; PostgREST answers "Could not find the
-- table 'public.conversation_current_facts' in the schema cache"). Almost
-- certainly a casualty of the Jun 2026 migration-ledger repair, where
-- MCP-stamped duplicate versions were reverted and local stamps marked
-- applied without re-executing their DDL. Nothing queried the view until the
-- Jul 2026 AI-memory section, which is why it went unnoticed.
--
-- Fully idempotent, safe where the objects already exist (local dev).

CREATE INDEX IF NOT EXISTS idx_conversation_facts_contact_field_current
  ON conversation_facts (contact_id, field_key, observed_at DESC)
  WHERE invalidated_at IS NULL;

CREATE OR REPLACE VIEW conversation_current_facts
WITH (security_invoker = true)
AS
SELECT DISTINCT ON (contact_id, field_key)
  *
FROM conversation_facts
WHERE invalidated_at IS NULL
ORDER BY contact_id, field_key, observed_at DESC, created_at DESC;

GRANT SELECT ON conversation_current_facts TO authenticated;
