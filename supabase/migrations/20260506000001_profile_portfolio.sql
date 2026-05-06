CREATE TABLE IF NOT EXISTS profile_portfolio_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  profile_id uuid NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  storage_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL,
  title text,
  caption text,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profile_portfolio_items_mime_type_check
    CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/webp')),
  CONSTRAINT profile_portfolio_items_size_bytes_check CHECK (size_bytes > 0),
  CONSTRAINT profile_portfolio_items_title_check
    CHECK (title IS NULL OR char_length(title) <= 120),
  CONSTRAINT profile_portfolio_items_caption_check
    CHECK (caption IS NULL OR char_length(caption) <= 1000),
  CONSTRAINT profile_portfolio_items_storage_owner_check
    CHECK ((storage.foldername(storage_path))[1] = profile_id::text)
);

CREATE INDEX IF NOT EXISTS idx_profile_portfolio_items_profile_order
  ON profile_portfolio_items (profile_id, sort_order, created_at DESC);

ALTER TABLE profile_portfolio_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Profiles are viewable by everyone" ON profiles;

CREATE POLICY "Profiles are viewable by authenticated users"
  ON profiles FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Authenticated users can read portfolio items"
  ON profile_portfolio_items FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Users can insert own portfolio items"
  ON profile_portfolio_items FOR INSERT
  TO authenticated
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can update own portfolio items"
  ON profile_portfolio_items FOR UPDATE
  TO authenticated
  USING (profile_id = auth.uid())
  WITH CHECK (profile_id = auth.uid());

CREATE POLICY "Users can delete own portfolio items"
  ON profile_portfolio_items FOR DELETE
  TO authenticated
  USING (profile_id = auth.uid());

INSERT INTO storage.buckets (id, name, public, allowed_mime_types)
VALUES (
  'profile-portfolio',
  'profile-portfolio',
  false,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  allowed_mime_types = EXCLUDED.allowed_mime_types,
  file_size_limit = NULL;

CREATE POLICY "Users can read own profile portfolio objects"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'profile-portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can upload own profile portfolio objects"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (
    bucket_id = 'profile-portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

CREATE POLICY "Users can delete own profile portfolio objects"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (
    bucket_id = 'profile-portfolio'
    AND (storage.foldername(name))[1] = auth.uid()::text
  );

UPDATE contacts c
SET profile_id = p.id,
    updated_at = now()
FROM profiles p
WHERE c.profile_id IS NULL
  AND lower(trim(c.email)) = lower(trim(p.email));

CREATE OR REPLACE FUNCTION link_contact_to_profile_if_unset(
  p_contact_id uuid,
  p_profile_id uuid
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_linked boolean := false;
BEGIN
  IF p_profile_id <> auth.uid() THEN
    RAISE EXCEPTION 'Cannot link contact to another profile'
      USING ERRCODE = '42501';
  END IF;

  UPDATE contacts c
  SET profile_id = p_profile_id,
      updated_at = now()
  FROM profiles p
  WHERE c.id = p_contact_id
    AND p.id = p_profile_id
    AND c.profile_id IS NULL
    AND lower(trim(c.email)) = lower(trim(p.email))
  RETURNING true INTO v_linked;

  RETURN coalesce(v_linked, false);
END;
$$;

GRANT EXECUTE ON FUNCTION link_contact_to_profile_if_unset(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION contact_ids_for_profile(
  p_profile_id uuid
) RETURNS uuid[]
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT coalesce(array_agg(id ORDER BY created_at DESC), ARRAY[]::uuid[])
  FROM contacts
  WHERE profile_id = p_profile_id
    AND (
      p_profile_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles
        WHERE profiles.id = auth.uid()
          AND profiles.role = 'admin'
      )
    );
$$;

GRANT EXECUTE ON FUNCTION contact_ids_for_profile(uuid) TO authenticated;
