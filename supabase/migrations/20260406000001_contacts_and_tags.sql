-- contacts table
CREATE TABLE contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text UNIQUE NOT NULL,
  name text NOT NULL,
  phone text,
  profile_id uuid REFERENCES profiles(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now() NOT NULL,
  updated_at timestamptz DEFAULT now() NOT NULL
);

-- tag_categories table
CREATE TABLE tag_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text UNIQUE NOT NULL,
  color text,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- tags table
CREATE TABLE tags (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES tag_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  UNIQUE (category_id, name)
);

-- contact_tags junction table
CREATE TABLE contact_tags (
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  tag_id uuid NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
  assigned_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (contact_id, tag_id)
);

-- contact_notes table
CREATE TABLE contact_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  author_id uuid NOT NULL REFERENCES auth.users(id),
  author_name text NOT NULL,
  text text NOT NULL CHECK (char_length(text) <= 2000),
  created_at timestamptz DEFAULT now() NOT NULL
);

-- Add contact_id to applications
ALTER TABLE applications ADD COLUMN contact_id uuid REFERENCES contacts(id);

-- Indexes
CREATE INDEX idx_contacts_email ON contacts (lower(email));
CREATE INDEX idx_contacts_profile_id ON contacts (profile_id) WHERE profile_id IS NOT NULL;
CREATE INDEX idx_tags_category_id ON tags (category_id);
CREATE INDEX idx_contact_tags_contact_id ON contact_tags (contact_id);
CREATE INDEX idx_contact_tags_tag_id ON contact_tags (tag_id);
CREATE INDEX idx_contact_notes_contact_id ON contact_notes (contact_id);
CREATE INDEX idx_applications_contact_id ON applications (contact_id) WHERE contact_id IS NOT NULL;

-- Enable RLS
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE tag_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_notes ENABLE ROW LEVEL SECURITY;

-- RLS: Admin-only for all new tables (same pattern as existing application policies)
CREATE POLICY "Admins can read contacts" ON contacts
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contacts" ON contacts
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update contacts" ON contacts
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete contacts" ON contacts
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read tag_categories" ON tag_categories
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert tag_categories" ON tag_categories
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update tag_categories" ON tag_categories
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete tag_categories" ON tag_categories
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read tags" ON tags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert tags" ON tags
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update tags" ON tags
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete tags" ON tags
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read contact_tags" ON contact_tags
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contact_tags" ON contact_tags
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete contact_tags" ON contact_tags
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read contact_notes" ON contact_notes
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contact_notes" ON contact_notes
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update contact_notes" ON contact_notes
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Ensure Realtime DELETE events include all columns for composite-PK tables
ALTER TABLE contact_tags REPLICA IDENTITY FULL;

-- Atomic find-or-create for the public application submission flow.
-- SECURITY DEFINER runs as the function owner (bypasses RLS) so unauthenticated
-- applicants can create/find a contact without exposing the contacts table publicly.
CREATE OR REPLACE FUNCTION find_or_create_contact(
  p_email text,
  p_name text,
  p_phone text DEFAULT NULL
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
BEGIN
  SELECT id INTO v_id FROM contacts WHERE email = lower(trim(p_email));
  IF v_id IS NOT NULL THEN
    RETURN v_id;
  END IF;

  INSERT INTO contacts (email, name, phone)
  VALUES (lower(trim(p_email)), p_name, p_phone)
  ON CONFLICT (email) DO NOTHING
  RETURNING id INTO v_id;

  -- If ON CONFLICT hit, the RETURNING gives NULL, so re-select
  IF v_id IS NULL THEN
    SELECT id INTO v_id FROM contacts WHERE email = lower(trim(p_email));
  END IF;

  RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION find_or_create_contact TO anon, authenticated;

-- Atomic sort_order helpers to avoid TOCTOU races
CREATE OR REPLACE FUNCTION insert_tag_category(p_name text, p_color text DEFAULT NULL)
RETURNS tag_categories
LANGUAGE sql
AS $$
  INSERT INTO tag_categories (name, color, sort_order)
  VALUES (p_name, p_color, (SELECT coalesce(max(sort_order), -1) + 1 FROM tag_categories))
  RETURNING *;
$$;

CREATE OR REPLACE FUNCTION insert_tag(p_category_id uuid, p_name text)
RETURNS tags
LANGUAGE sql
AS $$
  INSERT INTO tags (category_id, name, sort_order)
  VALUES (p_category_id, p_name, (SELECT coalesce(max(sort_order), -1) + 1 FROM tags WHERE category_id = p_category_id))
  RETURNING *;
$$;

-- Enable Realtime for relevant tables
ALTER PUBLICATION supabase_realtime ADD TABLE contacts;
ALTER PUBLICATION supabase_realtime ADD TABLE contact_tags;
ALTER PUBLICATION supabase_realtime ADD TABLE tag_categories;
ALTER PUBLICATION supabase_realtime ADD TABLE tags;

-- Seed contacts from existing applications
INSERT INTO contacts (email, name, phone)
SELECT DISTINCT ON (lower(trim(answers->>'email')))
  lower(trim(answers->>'email')),
  coalesce(
    nullif(trim(
      coalesce(answers->>'first_name', '') || ' ' || coalesce(answers->>'last_name', '')
    ), ''),
    'Unknown'
  ),
  nullif(trim(answers->>'phone'), '')
FROM applications
WHERE answers->>'email' IS NOT NULL
  AND trim(answers->>'email') != ''
ORDER BY lower(trim(answers->>'email')), submitted_at ASC;

-- Link existing applications to their contacts
UPDATE applications a
SET contact_id = c.id
FROM contacts c
WHERE lower(trim(a.answers->>'email')) = c.email
  AND a.contact_id IS NULL;
