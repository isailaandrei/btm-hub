CREATE TYPE email_send_kind AS ENUM ('broadcast', 'outreach');
CREATE TYPE email_send_status AS ENUM (
  'draft',
  'queued',
  'sending',
  'sent',
  'partially_failed',
  'failed'
);
CREATE TYPE email_recipient_status AS ENUM (
  'pending',
  'queued',
  'sending',
  'sent',
  'delivered',
  'clicked',
  'bounced',
  'complained',
  'failed',
  'skipped_unsubscribed',
  'skipped_suppressed',
  'unsubscribed'
);
CREATE TYPE email_event_type AS ENUM (
  'created',
  'queued',
  'sending',
  'sent',
  'delivered',
  'delivery_delayed',
  'clicked',
  'bounced',
  'complained',
  'failed',
  'unsubscribed',
  'suppressed'
);
CREATE TYPE email_suppression_reason AS ENUM (
  'hard_bounce',
  'spam_complaint',
  'invalid_address',
  'manual',
  'do_not_contact'
);

CREATE TABLE email_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 120),
  description text NOT NULL DEFAULT '' CHECK (char_length(description) <= 500),
  category text NOT NULL DEFAULT 'general' CHECK (char_length(category) <= 80),
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'archived')),
  builder_type text NOT NULL DEFAULT 'maily' CHECK (builder_type = 'maily'),
  current_version_id uuid,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_template_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  template_id uuid NOT NULL REFERENCES email_templates(id) ON DELETE CASCADE,
  version_number integer NOT NULL,
  subject text NOT NULL CHECK (char_length(trim(subject)) > 0 AND char_length(subject) <= 200),
  preview_text text NOT NULL DEFAULT '' CHECK (char_length(preview_text) <= 200),
  builder_json jsonb NOT NULL,
  html text NOT NULL,
  text text NOT NULL,
  asset_ids uuid[] NOT NULL DEFAULT ARRAY[]::uuid[],
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (template_id, version_number)
);

ALTER TABLE email_templates
  ADD CONSTRAINT email_templates_current_version_fk
  FOREIGN KEY (current_version_id)
  REFERENCES email_template_versions(id)
  DEFERRABLE INITIALLY DEFERRED;

CREATE TABLE email_assets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  storage_path text NOT NULL UNIQUE,
  public_url text NOT NULL,
  original_filename text NOT NULL,
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/gif', 'image/webp')),
  size_bytes integer NOT NULL CHECK (size_bytes > 0 AND size_bytes <= 5242880),
  width integer,
  height integer,
  created_by uuid NOT NULL REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE contact_email_preferences (
  contact_id uuid PRIMARY KEY REFERENCES contacts(id) ON DELETE CASCADE,
  newsletter_unsubscribed_at timestamptz,
  newsletter_unsubscribed_source text,
  updated_by uuid REFERENCES auth.users(id),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_suppressions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id uuid REFERENCES contacts(id) ON DELETE CASCADE,
  email text NOT NULL,
  reason email_suppression_reason NOT NULL,
  detail text NOT NULL DEFAULT '' CHECK (char_length(detail) <= 1000),
  provider text,
  provider_event_id text,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  lifted_at timestamptz,
  lifted_by uuid REFERENCES auth.users(id),
  CHECK (email = lower(trim(email)))
);

CREATE TABLE email_sends (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind email_send_kind NOT NULL,
  status email_send_status NOT NULL DEFAULT 'draft',
  name text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 160),
  subject_template text NOT NULL CHECK (char_length(trim(subject_template)) > 0 AND char_length(subject_template) <= 200),
  preview_text text NOT NULL DEFAULT '' CHECK (char_length(preview_text) <= 200),
  from_email text NOT NULL,
  from_name text NOT NULL DEFAULT 'Behind The Mask',
  reply_to_email text NOT NULL,
  template_version_id uuid REFERENCES email_template_versions(id),
  builder_json_snapshot jsonb NOT NULL,
  html_preview_snapshot text NOT NULL DEFAULT '',
  text_preview_snapshot text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  recipient_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  clicked_count integer NOT NULL DEFAULT 0,
  bounced_count integer NOT NULL DEFAULT 0,
  complained_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  unsubscribed_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_send_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id uuid NOT NULL REFERENCES email_sends(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  email text NOT NULL,
  contact_name_snapshot text NOT NULL DEFAULT '',
  personalization_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status email_recipient_status NOT NULL DEFAULT 'pending',
  skip_reason text,
  rendered_subject text,
  rendered_html text,
  rendered_text text,
  unsubscribe_token_hash text UNIQUE,
  provider text,
  provider_message_id text,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  send_attempts integer NOT NULL DEFAULT 0,
  last_error text,
  queued_at timestamptz,
  sending_started_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  unsubscribed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (email = lower(trim(email)))
);

CREATE TABLE email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  send_id uuid REFERENCES email_sends(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES email_send_recipients(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  type email_event_type NOT NULL,
  provider text,
  provider_event_id text,
  provider_message_id text,
  event_fingerprint text NOT NULL,
  occurred_at timestamptz NOT NULL,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (event_fingerprint)
);

CREATE UNIQUE INDEX idx_email_suppressions_active_email
  ON email_suppressions (email)
  WHERE lifted_at IS NULL;
CREATE UNIQUE INDEX idx_email_events_provider_event
  ON email_events (provider, provider_event_id)
  WHERE provider IS NOT NULL AND provider_event_id IS NOT NULL;
CREATE INDEX idx_email_templates_status ON email_templates (status);
CREATE INDEX idx_email_template_versions_template ON email_template_versions (template_id, version_number DESC);
CREATE INDEX idx_email_assets_created_at ON email_assets (created_at DESC);
CREATE INDEX idx_email_suppressions_contact ON email_suppressions (contact_id) WHERE lifted_at IS NULL;
CREATE INDEX idx_email_sends_created_at ON email_sends (created_at DESC);
CREATE INDEX idx_email_sends_status ON email_sends (status);
CREATE INDEX idx_email_send_recipients_send ON email_send_recipients (send_id, status);
CREATE INDEX idx_email_send_recipients_provider_message ON email_send_recipients (provider, provider_message_id)
  WHERE provider IS NOT NULL AND provider_message_id IS NOT NULL;
CREATE INDEX idx_email_events_recipient ON email_events (recipient_id, occurred_at DESC);

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_sends ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_send_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage email templates" ON email_templates
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage email template versions" ON email_template_versions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage email assets" ON email_assets
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage contact email preferences" ON contact_email_preferences
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage email suppressions" ON email_suppressions
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage email sends" ON email_sends
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage email send recipients" ON email_send_recipients
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

CREATE POLICY "Admins can manage email events" ON email_events
  FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'));

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-assets',
  'email-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif', 'image/webp']
)
ON CONFLICT (id) DO UPDATE
SET
  public = EXCLUDED.public,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

CREATE POLICY "Admins can read email asset objects" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'email-assets'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can upload email assets" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'email-assets'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can update email assets" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'email-assets'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  )
  WITH CHECK (
    bucket_id = 'email-assets'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE POLICY "Admins can delete email assets" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'email-assets'
    AND EXISTS (SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin')
  );

CREATE OR REPLACE FUNCTION create_email_template_version(
  p_template_id uuid,
  p_subject text,
  p_preview_text text,
  p_builder_json jsonb,
  p_html text,
  p_text text,
  p_asset_ids uuid[],
  p_user_id uuid
) RETURNS email_template_versions
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_version_number integer;
  v_version email_template_versions;
BEGIN
  PERFORM 1 FROM email_templates WHERE id = p_template_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email template not found';
  END IF;

  SELECT coalesce(max(version_number), 0) + 1
  INTO v_version_number
  FROM email_template_versions
  WHERE template_id = p_template_id;

  INSERT INTO email_template_versions (
    template_id,
    version_number,
    subject,
    preview_text,
    builder_json,
    html,
    text,
    asset_ids,
    created_by
  )
  VALUES (
    p_template_id,
    v_version_number,
    p_subject,
    p_preview_text,
    p_builder_json,
    p_html,
    p_text,
    coalesce(p_asset_ids, ARRAY[]::uuid[]),
    p_user_id
  )
  RETURNING * INTO v_version;

  UPDATE email_templates
  SET
    current_version_id = v_version.id,
    status = 'published',
    updated_by = p_user_id,
    updated_at = now()
  WHERE id = p_template_id;

  RETURN v_version;
END;
$$;

CREATE OR REPLACE FUNCTION create_email_send_with_recipients(
  p_kind email_send_kind,
  p_name text,
  p_subject_template text,
  p_preview_text text,
  p_from_email text,
  p_from_name text,
  p_reply_to_email text,
  p_template_version_id uuid,
  p_builder_json_snapshot jsonb,
  p_html_preview_snapshot text,
  p_text_preview_snapshot text,
  p_metadata jsonb,
  p_recipients jsonb,
  p_user_id uuid
) RETURNS email_sends
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_send email_sends;
  v_recipient_count integer := 0;
  v_skipped_count integer := 0;
BEGIN
  INSERT INTO email_sends (
    kind,
    name,
    subject_template,
    preview_text,
    from_email,
    from_name,
    reply_to_email,
    template_version_id,
    builder_json_snapshot,
    html_preview_snapshot,
    text_preview_snapshot,
    metadata,
    created_by,
    updated_by
  )
  VALUES (
    p_kind,
    p_name,
    p_subject_template,
    p_preview_text,
    p_from_email,
    p_from_name,
    p_reply_to_email,
    p_template_version_id,
    p_builder_json_snapshot,
    p_html_preview_snapshot,
    p_text_preview_snapshot,
    coalesce(p_metadata, '{}'::jsonb),
    p_user_id,
    p_user_id
  )
  RETURNING * INTO v_send;

  INSERT INTO email_send_recipients (
    send_id,
    contact_id,
    email,
    contact_name_snapshot,
    personalization_snapshot,
    status,
    skip_reason
  )
  SELECT
    v_send.id,
    r.contact_id,
    lower(trim(r.email)),
    coalesce(r.name, ''),
    coalesce(r.personalization, '{}'::jsonb),
    coalesce(r.status, 'pending'::email_recipient_status),
    r.skip_reason
  FROM jsonb_to_recordset(coalesce(p_recipients, '[]'::jsonb)) AS r(
    contact_id uuid,
    email text,
    name text,
    status email_recipient_status,
    personalization jsonb,
    skip_reason text
  );

  SELECT
    count(*) FILTER (WHERE status NOT IN ('skipped_unsubscribed', 'skipped_suppressed')),
    count(*) FILTER (WHERE status IN ('skipped_unsubscribed', 'skipped_suppressed'))
  INTO v_recipient_count, v_skipped_count
  FROM email_send_recipients
  WHERE send_id = v_send.id;

  UPDATE email_sends
  SET
    recipient_count = v_recipient_count,
    skipped_count = v_skipped_count,
    updated_at = now()
  WHERE id = v_send.id
  RETURNING * INTO v_send;

  RETURN v_send;
END;
$$;

CREATE OR REPLACE FUNCTION queue_email_send(
  p_send_id uuid,
  p_user_id uuid
) RETURNS email_sends
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_send email_sends;
BEGIN
  UPDATE email_sends
  SET
    status = CASE WHEN status = 'draft' THEN 'queued' ELSE status END,
    confirmed_by = coalesce(confirmed_by, p_user_id),
    confirmed_at = coalesce(confirmed_at, now()),
    updated_by = p_user_id,
    updated_at = now()
  WHERE id = p_send_id
  RETURNING * INTO v_send;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email send not found';
  END IF;

  UPDATE email_send_recipients r
  SET
    status = 'skipped_suppressed',
    skip_reason = 'suppressed',
    updated_at = now()
  WHERE r.send_id = p_send_id
    AND r.status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM email_suppressions s
      WHERE s.lifted_at IS NULL
        AND (
          s.email = r.email
          OR (s.contact_id IS NOT NULL AND s.contact_id = r.contact_id)
        )
    );

  UPDATE email_send_recipients r
  SET
    status = 'skipped_unsubscribed',
    skip_reason = 'newsletter_unsubscribed',
    updated_at = now()
  FROM email_sends s
  WHERE s.id = p_send_id
    AND s.kind = 'broadcast'
    AND r.send_id = p_send_id
    AND r.status = 'pending'
    AND EXISTS (
      SELECT 1
      FROM contact_email_preferences p
      WHERE p.contact_id = r.contact_id
        AND p.newsletter_unsubscribed_at IS NOT NULL
    );

  UPDATE email_send_recipients
  SET
    status = 'queued',
    queued_at = coalesce(queued_at, now()),
    updated_at = now()
  WHERE send_id = p_send_id
    AND status = 'pending';

  PERFORM update_email_send_counts(p_send_id);
  SELECT * INTO v_send FROM email_sends WHERE id = p_send_id;
  RETURN v_send;
END;
$$;

CREATE OR REPLACE FUNCTION mark_email_recipient_failure(
  p_recipient_id uuid,
  p_message text,
  p_max_attempts integer DEFAULT 3
) RETURNS email_send_recipients
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_recipient email_send_recipients;
  v_should_retry boolean;
BEGIN
  SELECT (send_attempts < greatest(p_max_attempts, 1))
  INTO v_should_retry
  FROM email_send_recipients
  WHERE id = p_recipient_id;

  UPDATE email_send_recipients
  SET
    status = CASE
      WHEN coalesce(v_should_retry, false) THEN 'queued'::email_recipient_status
      ELSE 'failed'::email_recipient_status
    END,
    last_error = p_message,
    queued_at = CASE
      WHEN coalesce(v_should_retry, false) THEN now()
      ELSE queued_at
    END,
    sending_started_at = NULL,
    updated_at = now()
  WHERE id = p_recipient_id
  RETURNING * INTO v_recipient;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Email recipient not found';
  END IF;

  RETURN v_recipient;
END;
$$;

CREATE OR REPLACE FUNCTION apply_email_provider_event(
  p_provider text,
  p_provider_message_id text,
  p_status email_recipient_status,
  p_timestamp_field text,
  p_occurred_at timestamptz
) RETURNS email_send_recipients
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_recipient email_send_recipients;
BEGIN
  UPDATE email_send_recipients r
  SET
    delivered_at = CASE
      WHEN p_timestamp_field = 'delivered_at' THEN coalesce(r.delivered_at, p_occurred_at)
      ELSE r.delivered_at
    END,
    clicked_at = CASE
      WHEN p_timestamp_field = 'clicked_at' THEN coalesce(r.clicked_at, p_occurred_at)
      ELSE r.clicked_at
    END,
    bounced_at = CASE
      WHEN p_timestamp_field = 'bounced_at' THEN coalesce(r.bounced_at, p_occurred_at)
      ELSE r.bounced_at
    END,
    complained_at = CASE
      WHEN p_timestamp_field = 'complained_at' THEN coalesce(r.complained_at, p_occurred_at)
      ELSE r.complained_at
    END,
    unsubscribed_at = CASE
      WHEN p_timestamp_field = 'unsubscribed_at' THEN coalesce(r.unsubscribed_at, p_occurred_at)
      ELSE r.unsubscribed_at
    END,
    status = CASE
      WHEN p_status = 'complained' THEN 'complained'::email_recipient_status
      WHEN p_status = 'bounced' AND r.status <> 'complained' THEN 'bounced'::email_recipient_status
      WHEN r.status IN (
        'complained',
        'bounced',
        'failed',
        'skipped_unsubscribed',
        'skipped_suppressed'
      ) THEN r.status
      WHEN p_status = 'unsubscribed' THEN 'unsubscribed'::email_recipient_status
      WHEN r.status = 'unsubscribed' THEN r.status
      WHEN p_status = 'clicked' THEN 'clicked'::email_recipient_status
      WHEN p_status = 'delivered' AND r.status <> 'clicked' THEN 'delivered'::email_recipient_status
      WHEN p_status = 'sent' AND r.status IN ('pending', 'queued', 'sending') THEN 'sent'::email_recipient_status
      ELSE r.status
    END,
    updated_at = now()
  WHERE r.provider = p_provider
    AND r.provider_message_id = p_provider_message_id
  RETURNING * INTO v_recipient;

  RETURN v_recipient;
END;
$$;

CREATE OR REPLACE FUNCTION claim_queued_email_recipients(
  p_send_id uuid,
  p_limit integer DEFAULT 25
) RETURNS SETOF email_send_recipients
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  UPDATE email_sends
  SET status = 'sending', updated_at = now()
  WHERE id = p_send_id
    AND status IN ('queued', 'sending');

  UPDATE email_send_recipients r
  SET
    status = 'skipped_suppressed',
    skip_reason = 'suppressed',
    updated_at = now()
  WHERE r.send_id = p_send_id
    AND r.status = 'queued'
    AND EXISTS (
      SELECT 1
      FROM email_suppressions s
      WHERE s.lifted_at IS NULL
        AND (
          s.email = r.email
          OR (s.contact_id IS NOT NULL AND s.contact_id = r.contact_id)
        )
    );

  UPDATE email_send_recipients r
  SET
    status = 'skipped_unsubscribed',
    skip_reason = 'newsletter_unsubscribed',
    updated_at = now()
  FROM email_sends s
  WHERE s.id = p_send_id
    AND s.kind = 'broadcast'
    AND r.send_id = p_send_id
    AND r.status = 'queued'
    AND EXISTS (
      SELECT 1
      FROM contact_email_preferences p
      WHERE p.contact_id = r.contact_id
        AND p.newsletter_unsubscribed_at IS NOT NULL
    );

  UPDATE email_send_recipients
  SET
    status = CASE
      WHEN send_attempts < 3 THEN 'queued'::email_recipient_status
      ELSE 'failed'::email_recipient_status
    END,
    last_error = CASE
      WHEN send_attempts < 3 THEN last_error
      ELSE coalesce(last_error, 'Email send timed out while sending')
    END,
    sending_started_at = NULL,
    queued_at = CASE
      WHEN send_attempts < 3 THEN now()
      ELSE queued_at
    END,
    updated_at = now()
  WHERE send_id = p_send_id
    AND status = 'sending'
    AND provider_message_id IS NULL
    AND sending_started_at < now() - interval '15 minutes';

  RETURN QUERY
  WITH claimed AS (
    SELECT id
    FROM email_send_recipients
    WHERE send_id = p_send_id
      AND status = 'queued'
    ORDER BY created_at, id
    FOR UPDATE SKIP LOCKED
    LIMIT greatest(p_limit, 1)
  )
  UPDATE email_send_recipients r
  SET
    status = 'sending',
    sending_started_at = now(),
    send_attempts = r.send_attempts + 1,
    updated_at = now()
  FROM claimed
  WHERE r.id = claimed.id
  RETURNING r.*;
END;
$$;

CREATE OR REPLACE FUNCTION update_email_send_counts(
  p_send_id uuid
) RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  v_counts record;
  v_terminal boolean;
BEGIN
  SELECT
    count(*) FILTER (WHERE status NOT IN ('skipped_unsubscribed', 'skipped_suppressed')) AS recipient_count,
    count(*) FILTER (WHERE status IN ('skipped_unsubscribed', 'skipped_suppressed')) AS skipped_count,
    count(*) FILTER (WHERE sent_at IS NOT NULL) AS sent_count,
    count(*) FILTER (WHERE delivered_at IS NOT NULL) AS delivered_count,
    count(*) FILTER (WHERE clicked_at IS NOT NULL) AS clicked_count,
    count(*) FILTER (WHERE bounced_at IS NOT NULL OR status = 'bounced') AS bounced_count,
    count(*) FILTER (WHERE complained_at IS NOT NULL OR status = 'complained') AS complained_count,
    count(*) FILTER (WHERE status = 'failed') AS failed_count,
    count(*) FILTER (WHERE unsubscribed_at IS NOT NULL OR status = 'unsubscribed') AS unsubscribed_count,
    count(*) FILTER (WHERE status IN ('pending', 'queued', 'sending')) = 0 AS terminal
  INTO v_counts
  FROM email_send_recipients
  WHERE send_id = p_send_id;

  v_terminal := coalesce(v_counts.terminal, true);

  UPDATE email_sends
  SET
    recipient_count = coalesce(v_counts.recipient_count, 0),
    skipped_count = coalesce(v_counts.skipped_count, 0),
    sent_count = coalesce(v_counts.sent_count, 0),
    delivered_count = coalesce(v_counts.delivered_count, 0),
    clicked_count = coalesce(v_counts.clicked_count, 0),
    bounced_count = coalesce(v_counts.bounced_count, 0),
    complained_count = coalesce(v_counts.complained_count, 0),
    failed_count = coalesce(v_counts.failed_count, 0),
    unsubscribed_count = coalesce(v_counts.unsubscribed_count, 0),
    status = CASE
      WHEN NOT v_terminal THEN status
      WHEN coalesce(v_counts.failed_count, 0) > 0 AND coalesce(v_counts.sent_count, 0) = 0 THEN 'failed'::email_send_status
      WHEN coalesce(v_counts.failed_count, 0) > 0 THEN 'partially_failed'::email_send_status
      WHEN coalesce(v_counts.recipient_count, 0) = 0 THEN 'sent'::email_send_status
      ELSE 'sent'::email_send_status
    END,
    updated_at = now()
  WHERE id = p_send_id;
END;
$$;

ALTER PUBLICATION supabase_realtime ADD TABLE email_templates;
ALTER PUBLICATION supabase_realtime ADD TABLE email_sends;
ALTER PUBLICATION supabase_realtime ADD TABLE email_send_recipients;
