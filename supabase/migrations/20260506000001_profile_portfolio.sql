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
SET search_path = public, pg_temp
AS $$
DECLARE
  v_linked boolean := false;
BEGIN
  IF auth.uid() IS NULL OR p_profile_id IS DISTINCT FROM auth.uid() THEN
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

REVOKE EXECUTE ON FUNCTION link_contact_to_profile_if_unset(uuid, uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION link_contact_to_profile_if_unset(uuid, uuid)
  TO authenticated;

CREATE OR REPLACE FUNCTION contact_ids_for_profile(
  p_profile_id uuid
) RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_contact_ids uuid[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required'
      USING ERRCODE = '42501';
  END IF;

  SELECT coalesce(array_agg(c.id ORDER BY c.created_at DESC), ARRAY[]::uuid[])
  INTO v_contact_ids
  FROM contacts c
  WHERE c.profile_id = p_profile_id
    AND (
      p_profile_id = auth.uid()
      OR EXISTS (
        SELECT 1 FROM profiles p
        WHERE p.id = auth.uid()
          AND p.role = 'admin'
      )
    );

  RETURN v_contact_ids;
END;
$$;

REVOKE EXECUTE ON FUNCTION contact_ids_for_profile(uuid)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION contact_ids_for_profile(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION enforce_profile_portfolio_item_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_count integer;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(NEW.profile_id::text, 0));

  SELECT count(*)
  INTO v_count
  FROM profile_portfolio_items
  WHERE profile_id = NEW.profile_id;

  IF v_count >= 50 THEN
    RAISE EXCEPTION 'Portfolio limit reached (50 images).'
      USING ERRCODE = '23514';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION enforce_profile_portfolio_item_limit()
  FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS enforce_profile_portfolio_item_limit_before_insert
  ON profile_portfolio_items;

CREATE TRIGGER enforce_profile_portfolio_item_limit_before_insert
  BEFORE INSERT ON profile_portfolio_items
  FOR EACH ROW
  EXECUTE FUNCTION enforce_profile_portfolio_item_limit();
