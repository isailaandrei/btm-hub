ALTER TABLE crm_ai_contact_dossiers
  ADD COLUMN IF NOT EXISTS generator_model text;

COMMENT ON COLUMN crm_ai_contact_dossiers.generator_model
  IS 'OpenAI model id used to generate this dossier (for example gpt-5.4). Null for historical rows built before model provenance was persisted.';
