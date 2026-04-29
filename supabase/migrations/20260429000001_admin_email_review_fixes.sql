ALTER TABLE email_campaigns
  ADD COLUMN mjml_snapshot text NOT NULL DEFAULT '';

CREATE OR REPLACE FUNCTION public.create_email_template_version(
  p_template_id uuid,
  p_subject text,
  p_preview_text text,
  p_builder_json jsonb,
  p_mjml text,
  p_html text,
  p_text text,
  p_asset_ids uuid[],
  p_user_id uuid
)
RETURNS email_template_versions
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_next_version integer;
  v_version email_template_versions;
BEGIN
  IF NOT public.is_admin() THEN
    RAISE EXCEPTION 'Only admins can create email template versions'
      USING ERRCODE = '42501';
  END IF;

  IF p_user_id IS DISTINCT FROM auth.uid() THEN
    RAISE EXCEPTION 'Template version user mismatch'
      USING ERRCODE = '42501';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext(p_template_id::text)::bigint);

  SELECT coalesce(max(version_number), 0) + 1
    INTO v_next_version
  FROM email_template_versions
  WHERE template_id = p_template_id;

  INSERT INTO email_template_versions (
    template_id,
    version_number,
    subject,
    preview_text,
    builder_json,
    mjml,
    html,
    text,
    asset_ids,
    created_by
  )
  VALUES (
    p_template_id,
    v_next_version,
    p_subject,
    p_preview_text,
    p_builder_json,
    p_mjml,
    p_html,
    p_text,
    p_asset_ids,
    p_user_id
  )
  RETURNING * INTO v_version;

  UPDATE email_templates
  SET current_version_id = v_version.id,
      updated_by = p_user_id,
      updated_at = now()
  WHERE id = p_template_id;

  RETURN v_version;
END;
$$;

REVOKE ALL ON FUNCTION public.create_email_template_version(
  uuid,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  uuid[],
  uuid
) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.create_email_template_version(
  uuid,
  text,
  text,
  jsonb,
  text,
  text,
  text,
  uuid[],
  uuid
) TO authenticated;
