-- Admin AI threads/messages/citations: shared across ALL admins.
--
-- The original policies (20260415000001) scoped everything to the authoring
-- admin (`author_id = auth.uid()`), so a thread created by one admin login was
-- invisible to every other admin — including the same person logged in with a
-- different account on another host. Product decision (Andrei, Jul 7 2026):
-- the AI agent is a shared admin workspace; every admin sees and can curate
-- every thread. INSERT still records the acting admin as author
-- (`author_id = auth.uid()`) so attribution stays honest.

-- ---------------------------------------------------------------------------
-- Drop the author-scoped policies (12 from 20260415000001)
-- ---------------------------------------------------------------------------

DROP POLICY "Admin authors can read own threads" ON admin_ai_threads;
DROP POLICY "Admin authors can insert own threads" ON admin_ai_threads;
DROP POLICY "Admin authors can update own threads" ON admin_ai_threads;
DROP POLICY "Admin authors can delete own threads" ON admin_ai_threads;

DROP POLICY "Admin authors can read own thread messages" ON admin_ai_messages;
DROP POLICY "Admin authors can insert own thread messages" ON admin_ai_messages;
DROP POLICY "Admin authors can update own thread messages" ON admin_ai_messages;
DROP POLICY "Admin authors can delete own thread messages" ON admin_ai_messages;

DROP POLICY "Admin authors can read own citations" ON admin_ai_message_citations;
DROP POLICY "Admin authors can insert own citations" ON admin_ai_message_citations;
DROP POLICY "Admin authors can update own citations" ON admin_ai_message_citations;
DROP POLICY "Admin authors can delete own citations" ON admin_ai_message_citations;

-- ---------------------------------------------------------------------------
-- Threads: any admin can read/update/delete; insert as yourself only
-- ---------------------------------------------------------------------------

CREATE POLICY "Admins can read threads" ON admin_ai_threads
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert own threads" ON admin_ai_threads
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

CREATE POLICY "Admins can update threads" ON admin_ai_threads
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
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

CREATE POLICY "Admins can delete threads" ON admin_ai_threads
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Messages: admin-wide. Parent-thread linkage is enforced by the FK; the
-- thread's own SELECT policy no longer narrows visibility per author.
-- ---------------------------------------------------------------------------

CREATE POLICY "Admins can read thread messages" ON admin_ai_messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert thread messages" ON admin_ai_messages
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update thread messages" ON admin_ai_messages
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete thread messages" ON admin_ai_messages
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

-- ---------------------------------------------------------------------------
-- Citations: admin-wide (linkage enforced by FK to messages)
-- ---------------------------------------------------------------------------

CREATE POLICY "Admins can read citations" ON admin_ai_message_citations
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can insert citations" ON admin_ai_message_citations
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can update citations" ON admin_ai_message_citations
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  ) WITH CHECK (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );

CREATE POLICY "Admins can delete citations" ON admin_ai_message_citations
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
    )
  );
