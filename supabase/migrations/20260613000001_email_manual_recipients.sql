CREATE TABLE email_manual_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL,
  name text NOT NULL DEFAULT '' CHECK (char_length(name) <= 160),
  notes text NOT NULL DEFAULT '' CHECK (char_length(notes) <= 1000),
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(trim(email))),
  CHECK (char_length(email) > 0)
);

CREATE UNIQUE INDEX idx_email_manual_recipients_email
  ON email_manual_recipients (email);
CREATE INDEX idx_email_manual_recipients_name
  ON email_manual_recipients (name);

ALTER TABLE email_manual_recipients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email manual recipients" ON email_manual_recipients
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));
