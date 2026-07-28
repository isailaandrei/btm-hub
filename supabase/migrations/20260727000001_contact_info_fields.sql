-- Person-level custom info on contacts (insurance number, address, rashguard
-- size, …): fields are admin-defined once and reusable across all contacts;
-- values are free text. Keyed by contact, not profile — most contacts have no
-- profiles row. A future member self-service form will add member-scoped RLS
-- via contacts.profile_id; none of that exists yet.

CREATE TABLE contact_info_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  sort_order integer DEFAULT 0 NOT NULL,
  created_at timestamptz DEFAULT now() NOT NULL
);

-- "Address" and "address" are the same field.
CREATE UNIQUE INDEX contact_info_fields_name_ci ON contact_info_fields (lower(name));

CREATE TABLE contact_info_values (
  contact_id uuid NOT NULL REFERENCES contacts(id) ON DELETE CASCADE,
  field_id uuid NOT NULL REFERENCES contact_info_fields(id) ON DELETE CASCADE,
  value text NOT NULL CHECK (char_length(value) <= 2000),
  updated_at timestamptz DEFAULT now() NOT NULL,
  PRIMARY KEY (contact_id, field_id)
);

CREATE INDEX idx_contact_info_values_field_id ON contact_info_values (field_id);

ALTER TABLE contact_info_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_info_values ENABLE ROW LEVEL SECURITY;

-- Admin-only, all four ops on both tables. Values are UPDATEd in place by the
-- upsert paths, so UPDATE policies are load-bearing here (contact_tags gets
-- away without one only because assignments are insert/delete-only).
CREATE POLICY "Admins can read contact_info_fields" ON contact_info_fields
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contact_info_fields" ON contact_info_fields
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update contact_info_fields" ON contact_info_fields
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete contact_info_fields" ON contact_info_fields
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

CREATE POLICY "Admins can read contact_info_values" ON contact_info_values
  FOR SELECT USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can insert contact_info_values" ON contact_info_values
  FOR INSERT WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can update contact_info_values" ON contact_info_values
  FOR UPDATE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  )) WITH CHECK (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));
CREATE POLICY "Admins can delete contact_info_values" ON contact_info_values
  FOR DELETE USING (EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  ));

-- Find-or-create the field case-insensitively (find_or_create_contact shape:
-- insert ON CONFLICT DO NOTHING + re-select, safe under concurrent creates),
-- with atomic sort_order assignment (insert_tag shape), then upsert the value.
-- Runs with the CALLER's rights — admin RLS above applies; no SECURITY DEFINER.
-- Trims the name here too: the function is callable directly, and 'Address '
-- vs 'Address' must not mint duplicate fields.
CREATE OR REPLACE FUNCTION set_contact_info_field_value(
  p_contact_id uuid,
  p_field_name text,
  p_value text
) RETURNS contact_info_fields
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_name text := trim(p_field_name);
  v_field contact_info_fields;
BEGIN
  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Field name must not be empty';
  END IF;

  SELECT * INTO v_field FROM contact_info_fields
  WHERE lower(name) = lower(v_name);

  IF v_field.id IS NULL THEN
    INSERT INTO contact_info_fields (name, sort_order)
    VALUES (v_name, (SELECT coalesce(max(sort_order), -1) + 1 FROM contact_info_fields))
    ON CONFLICT ((lower(name))) DO NOTHING
    RETURNING * INTO v_field;

    -- Lost a concurrent create race: the conflict clause swallowed the insert,
    -- so re-select the winner.
    IF v_field.id IS NULL THEN
      SELECT * INTO v_field FROM contact_info_fields
      WHERE lower(name) = lower(v_name);
    END IF;
  END IF;

  INSERT INTO contact_info_values (contact_id, field_id, value)
  VALUES (p_contact_id, v_field.id, p_value)
  ON CONFLICT (contact_id, field_id)
  DO UPDATE SET value = excluded.value, updated_at = now();

  RETURN v_field;
END;
$$;
