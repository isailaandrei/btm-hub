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
