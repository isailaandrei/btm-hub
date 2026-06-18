-- Email studio redesign — Phase 3: static mailing lists.
--
-- A list is a frozen set of members (each a contact OR a saved manual recipient)
-- that admins build by selecting people across tags. Membership does NOT drift
-- when tags change — that's what segments (Phase 4) are for. Lists/members are
-- global/admin-shared, matching contacts and manual recipients.

CREATE TABLE email_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_list_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  list_id uuid NOT NULL REFERENCES email_lists(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  manual_recipient_id uuid REFERENCES email_manual_recipients(id) ON DELETE CASCADE,
  email text NOT NULL CHECK (email = lower(trim(email))),
  added_at timestamptz NOT NULL DEFAULT now(),
  -- Exactly one of the two links is set: a member is a contact xor a manual recipient.
  CHECK (
    (contact_id IS NOT NULL)::int + (manual_recipient_id IS NOT NULL)::int = 1
  )
);

-- A contact / manual recipient appears at most once per list.
CREATE UNIQUE INDEX idx_email_list_members_contact
  ON email_list_members (list_id, contact_id)
  WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX idx_email_list_members_manual
  ON email_list_members (list_id, manual_recipient_id)
  WHERE manual_recipient_id IS NOT NULL;
CREATE INDEX idx_email_list_members_list ON email_list_members (list_id);
CREATE INDEX idx_email_lists_updated_at ON email_lists (updated_at DESC);

ALTER TABLE email_lists ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_list_members ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email lists" ON email_lists
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage email list members" ON email_list_members
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
