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

-- Also allow the application submission flow to insert/read contacts (for find-or-create)
CREATE POLICY "Anyone can insert contacts on submission" ON contacts
  FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can read contacts by email" ON contacts
  FOR SELECT USING (true);

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
