-- Admin AI Analyst: persistence tables, read-model views, and evidence search RPC.
--
-- Scope:
--   * Three tables for private admin-owned thread history:
--       admin_ai_threads, admin_ai_messages, admin_ai_message_citations
--   * Two read-model views (security_invoker):
--       admin_ai_contact_facts, admin_ai_evidence_items
--   * One FTS RPC: search_admin_ai_evidence(...)
--
-- Design notes:
--   * admin_ai_messages.content is plain text. Provider-native block arrays and
--     tool traces are NOT stored.
--   * Threads are private to their author. RLS enforces both authenticated
--     admin role and author ownership.
--   * Evidence is computed on the fly from contact_notes, applications.admin_notes,
--     and an allowlisted set of applications.answers keys. No embeddings, no
--     persisted tsvector on the view.
--   * search_admin_ai_evidence is SECURITY INVOKER (default) so the underlying
--     RLS policies on contacts/applications/contact_notes apply.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE admin_ai_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  author_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  scope text NOT NULL CHECK (scope IN ('global', 'contact')),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  title text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT admin_ai_threads_scope_contact_check CHECK (
    (scope = 'contact' AND contact_id IS NOT NULL)
    OR (scope = 'global' AND contact_id IS NULL)
  )
);

CREATE TABLE admin_ai_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL REFERENCES admin_ai_threads(id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('user', 'assistant')),
  content text NOT NULL,
  status text NOT NULL DEFAULT 'complete' CHECK (status IN ('complete', 'failed')),
  query_plan jsonb,
  response_json jsonb,
  model_metadata jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE admin_ai_message_citations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id uuid NOT NULL REFERENCES admin_ai_messages(id) ON DELETE CASCADE,
  claim_key text NOT NULL,
  source_type text NOT NULL CHECK (
    source_type IN ('application_answer', 'contact_note', 'application_admin_note')
  ),
  source_id text NOT NULL,
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  application_id uuid REFERENCES applications(id) ON DELETE CASCADE,
  source_label text NOT NULL,
  snippet text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE INDEX idx_admin_ai_threads_author_scope_updated
  ON admin_ai_threads (author_id, scope, updated_at DESC);

CREATE INDEX idx_admin_ai_threads_contact_updated
  ON admin_ai_threads (contact_id, updated_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE INDEX idx_admin_ai_messages_thread_created
  ON admin_ai_messages (thread_id, created_at);

CREATE INDEX idx_admin_ai_message_citations_message_claim
  ON admin_ai_message_citations (message_id, claim_key);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

-- Bump admin_ai_threads.updated_at on UPDATE when the title (or any
-- user-visible column other than updated_at itself) changes. This is a
-- BEFORE UPDATE trigger that mutates NEW directly.
CREATE OR REPLACE FUNCTION admin_ai_threads_bump_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.title IS DISTINCT FROM OLD.title
     OR NEW.scope IS DISTINCT FROM OLD.scope
     OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
  THEN
    NEW.updated_at := now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_ai_threads_bump_updated_at_trg
  BEFORE UPDATE ON admin_ai_threads
  FOR EACH ROW
  EXECUTE FUNCTION admin_ai_threads_bump_updated_at();

-- When a new message is inserted, bump the parent thread's updated_at so
-- thread lists sort correctly by "most recent activity".
CREATE OR REPLACE FUNCTION admin_ai_messages_touch_thread()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  UPDATE admin_ai_threads
     SET updated_at = now()
   WHERE id = NEW.thread_id;
  RETURN NEW;
END;
$$;

CREATE TRIGGER admin_ai_messages_touch_thread_trg
  AFTER INSERT ON admin_ai_messages
  FOR EACH ROW
  EXECUTE FUNCTION admin_ai_messages_touch_thread();

-- ---------------------------------------------------------------------------
-- RLS: admin-only + author-scoped
-- ---------------------------------------------------------------------------

ALTER TABLE admin_ai_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_ai_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE admin_ai_message_citations ENABLE ROW LEVEL SECURITY;

-- Threads: author must be the current user AND be an admin. Contact-scoped
-- threads additionally require that contact_id points to a real row
-- (FK already enforces that, but we keep the RLS predicate minimal here).

CREATE POLICY "Admin authors can read own threads" ON admin_ai_threads
  FOR SELECT USING (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin authors can insert own threads" ON admin_ai_threads
  FOR INSERT WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
    AND (
      scope = 'global'
      OR (
        scope = 'contact'
        AND contact_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_id)
      )
    )
  );

CREATE POLICY "Admin authors can update own threads" ON admin_ai_threads
  FOR UPDATE USING (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
    AND (
      scope = 'global'
      OR (
        scope = 'contact'
        AND contact_id IS NOT NULL
        AND EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_id)
      )
    )
  );

CREATE POLICY "Admin authors can delete own threads" ON admin_ai_threads
  FOR DELETE USING (
    author_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Messages: access is gated by the parent thread's author.

CREATE POLICY "Admin authors can read own thread messages" ON admin_ai_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM admin_ai_threads t
      WHERE t.id = thread_id AND t.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin authors can insert own thread messages" ON admin_ai_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_ai_threads t
      WHERE t.id = thread_id AND t.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin authors can update own thread messages" ON admin_ai_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM admin_ai_threads t
      WHERE t.id = thread_id AND t.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM admin_ai_threads t
      WHERE t.id = thread_id AND t.author_id = auth.uid()
    )
  );

CREATE POLICY "Admin authors can delete own thread messages" ON admin_ai_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM admin_ai_threads t
      WHERE t.id = thread_id AND t.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- Citations: access is gated by the citation's message -> thread's author.

CREATE POLICY "Admin authors can read own citations" ON admin_ai_message_citations
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM admin_ai_messages m
      JOIN admin_ai_threads t ON t.id = m.thread_id
      WHERE m.id = message_id AND t.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admin authors can insert own citations" ON admin_ai_message_citations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM admin_ai_messages m
      JOIN admin_ai_threads t ON t.id = m.thread_id
      WHERE m.id = message_id AND t.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
    AND EXISTS (SELECT 1 FROM contacts WHERE contacts.id = contact_id)
  );

CREATE POLICY "Admin authors can update own citations" ON admin_ai_message_citations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1
      FROM admin_ai_messages m
      JOIN admin_ai_threads t ON t.id = m.thread_id
      WHERE m.id = message_id AND t.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1
      FROM admin_ai_messages m
      JOIN admin_ai_threads t ON t.id = m.thread_id
      WHERE m.id = message_id AND t.author_id = auth.uid()
    )
  );

CREATE POLICY "Admin authors can delete own citations" ON admin_ai_message_citations
  FOR DELETE USING (
    EXISTS (
      SELECT 1
      FROM admin_ai_messages m
      JOIN admin_ai_threads t ON t.id = m.thread_id
      WHERE m.id = message_id AND t.author_id = auth.uid()
    )
    AND EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- GRANTs
-- ---------------------------------------------------------------------------

GRANT SELECT, INSERT, UPDATE, DELETE ON admin_ai_threads TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_ai_messages TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON admin_ai_message_citations TO authenticated;

-- ---------------------------------------------------------------------------
-- View: admin_ai_contact_facts
--
-- One row per (contact, application) snapshot. Contacts with no applications
-- still appear (left join) so lookups by contact don't silently drop rows.
-- security_invoker = true so the caller's RLS on contacts/applications/tags
-- determines visibility.
-- ---------------------------------------------------------------------------

CREATE VIEW admin_ai_contact_facts
WITH (security_invoker = true) AS
SELECT
  c.id AS contact_id,
  a.id AS application_id,
  c.name AS contact_name,
  c.email AS contact_email,
  c.phone AS contact_phone,
  a.program,
  a.status,
  a.submitted_at,
  COALESCE(ct.tag_ids, ARRAY[]::uuid[]) AS tag_ids,
  COALESCE(ct.tag_names, ARRAY[]::text[]) AS tag_names,
  a.answers ->> 'budget' AS budget,
  a.answers ->> 'time_availability' AS time_availability,
  a.answers ->> 'start_timeline' AS start_timeline,
  a.answers ->> 'travel_willingness' AS travel_willingness,
  a.answers ->> 'languages' AS languages,
  a.answers ->> 'country_of_residence' AS country_of_residence,
  a.answers ->> 'certification_level' AS certification_level,
  a.answers ->> 'years_experience' AS years_experience,
  a.answers ->> 'involvement_level' AS involvement_level
FROM contacts c
LEFT JOIN applications a ON a.contact_id = c.id
LEFT JOIN LATERAL (
  SELECT
    array_agg(t.id ORDER BY t.name) AS tag_ids,
    array_agg(t.name ORDER BY t.name) AS tag_names
  FROM contact_tags xt
  JOIN tags t ON t.id = xt.tag_id
  WHERE xt.contact_id = c.id
) ct ON TRUE;

-- ---------------------------------------------------------------------------
-- View: admin_ai_evidence_items
--
-- Unions three evidence sources into a single shape with a stable evidence_id.
-- security_invoker = true so RLS applies to the underlying tables.
-- Rows with NULL or blank text are discarded.
-- ---------------------------------------------------------------------------

CREATE VIEW admin_ai_evidence_items
WITH (security_invoker = true) AS
-- Application free-text answers (allowlisted keys)
SELECT
  a.id::text || ':' || answer_items.source_label AS evidence_id,
  a.contact_id,
  a.id AS application_id,
  'application_answer'::text AS source_type,
  a.id::text || ':' || answer_items.source_label AS source_id,
  answer_items.source_label,
  a.submitted_at AS source_timestamp,
  a.program,
  answer_items.text
FROM applications a
CROSS JOIN LATERAL (
  VALUES
    ('ultimate_vision', a.answers ->> 'ultimate_vision'),
    ('inspiration_to_apply', a.answers ->> 'inspiration_to_apply'),
    ('questions_or_concerns', a.answers ->> 'questions_or_concerns'),
    ('anything_else', a.answers ->> 'anything_else'),
    ('current_occupation', a.answers ->> 'current_occupation'),
    ('filming_equipment', a.answers ->> 'filming_equipment'),
    ('photography_equipment', a.answers ->> 'photography_equipment'),
    ('filmmaking_experience', a.answers ->> 'filmmaking_experience'),
    ('internship_hopes', a.answers ->> 'internship_hopes'),
    ('candidacy_reason', a.answers ->> 'candidacy_reason')
) AS answer_items(source_label, text)
WHERE answer_items.text IS NOT NULL AND btrim(answer_items.text) <> ''
  AND a.contact_id IS NOT NULL

UNION ALL

-- Contact notes
SELECT
  cn.id::text AS evidence_id,
  cn.contact_id,
  NULL::uuid AS application_id,
  'contact_note'::text AS source_type,
  cn.id::text AS source_id,
  'Contact note (' || COALESCE(cn.author_name, 'admin') || ')' AS source_label,
  cn.created_at AS source_timestamp,
  NULL::text AS program,
  cn.text
FROM contact_notes cn
WHERE cn.text IS NOT NULL AND btrim(cn.text) <> ''

UNION ALL

-- Application admin notes (JSONB array, preserve 0-based position)
SELECT
  a.id::text || ':an:' || (note_row.ordinality - 1)::text AS evidence_id,
  a.contact_id,
  a.id AS application_id,
  'application_admin_note'::text AS source_type,
  a.id::text || ':an:' || (note_row.ordinality - 1)::text AS source_id,
  'Admin note (' || COALESCE(note_row.note ->> 'author_name', 'admin') || ')' AS source_label,
  COALESCE((note_row.note ->> 'created_at')::timestamptz, a.submitted_at) AS source_timestamp,
  a.program,
  note_row.note ->> 'text' AS text
FROM applications a
CROSS JOIN LATERAL jsonb_array_elements(
  COALESCE(a.admin_notes, '[]'::jsonb)
) WITH ORDINALITY AS note_row(note, ordinality)
WHERE (note_row.note ->> 'text') IS NOT NULL
  AND btrim(note_row.note ->> 'text') <> ''
  AND a.contact_id IS NOT NULL;

-- ---------------------------------------------------------------------------
-- RPC: search_admin_ai_evidence
--
-- Runs full-text search against admin_ai_evidence_items. The function is
-- SECURITY INVOKER (default), so evidence visibility follows the caller's
-- RLS on the underlying tables.
--
-- Behavior:
--   * Non-empty p_query -> websearch_to_tsquery + ts_rank_cd ranking.
--   * Degenerate tsquery (empty) -> plain ILIKE fallback.
--   * p_contact_id filters to one contact; otherwise p_contact_ids (if
--     non-empty) filters to that list; otherwise all contacts visible to
--     the caller.
--   * Always applies p_limit.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION search_admin_ai_evidence(
  p_query text,
  p_contact_ids uuid[] DEFAULT NULL,
  p_contact_id uuid DEFAULT NULL,
  p_limit int DEFAULT 40
)
RETURNS TABLE (
  evidence_id text,
  contact_id uuid,
  application_id uuid,
  source_type text,
  source_id text,
  source_label text,
  source_timestamp timestamptz,
  program text,
  text text
)
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  v_tsquery tsquery;
  v_effective_limit int := GREATEST(COALESCE(p_limit, 40), 1);
  v_has_query boolean := p_query IS NOT NULL AND btrim(p_query) <> '';
BEGIN
  IF v_has_query THEN
    v_tsquery := websearch_to_tsquery('english', p_query);
  END IF;

  IF v_has_query AND v_tsquery IS NOT NULL AND v_tsquery::text <> '' THEN
    -- FTS path with ranking
    RETURN QUERY
    SELECT
      ei.evidence_id,
      ei.contact_id,
      ei.application_id,
      ei.source_type,
      ei.source_id,
      ei.source_label,
      ei.source_timestamp,
      ei.program,
      ei.text
    FROM admin_ai_evidence_items ei
    WHERE to_tsvector('english', ei.text) @@ v_tsquery
      AND (
        p_contact_id IS NOT NULL
          AND ei.contact_id = p_contact_id
        OR p_contact_id IS NULL
           AND (
             p_contact_ids IS NULL
             OR array_length(p_contact_ids, 1) IS NULL
             OR ei.contact_id = ANY(p_contact_ids)
           )
      )
    ORDER BY
      ts_rank_cd(to_tsvector('english', ei.text), v_tsquery) DESC,
      ei.source_timestamp DESC
    LIMIT v_effective_limit;
  ELSIF v_has_query THEN
    -- Fallback ILIKE path for degenerate tsquery input
    RETURN QUERY
    SELECT
      ei.evidence_id,
      ei.contact_id,
      ei.application_id,
      ei.source_type,
      ei.source_id,
      ei.source_label,
      ei.source_timestamp,
      ei.program,
      ei.text
    FROM admin_ai_evidence_items ei
    WHERE ei.text ILIKE '%' || p_query || '%'
      AND (
        p_contact_id IS NOT NULL
          AND ei.contact_id = p_contact_id
        OR p_contact_id IS NULL
           AND (
             p_contact_ids IS NULL
             OR array_length(p_contact_ids, 1) IS NULL
             OR ei.contact_id = ANY(p_contact_ids)
           )
      )
    ORDER BY ei.source_timestamp DESC
    LIMIT v_effective_limit;
  ELSE
    -- No query: return by recency under contact scoping
    RETURN QUERY
    SELECT
      ei.evidence_id,
      ei.contact_id,
      ei.application_id,
      ei.source_type,
      ei.source_id,
      ei.source_label,
      ei.source_timestamp,
      ei.program,
      ei.text
    FROM admin_ai_evidence_items ei
    WHERE (
      p_contact_id IS NOT NULL
        AND ei.contact_id = p_contact_id
      OR p_contact_id IS NULL
         AND (
           p_contact_ids IS NULL
           OR array_length(p_contact_ids, 1) IS NULL
           OR ei.contact_id = ANY(p_contact_ids)
         )
    )
    ORDER BY ei.source_timestamp DESC
    LIMIT v_effective_limit;
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION search_admin_ai_evidence(text, uuid[], uuid, int) TO authenticated;
