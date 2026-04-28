CREATE TYPE email_campaign_kind AS ENUM ('broadcast', 'outreach', 'one_off');
CREATE TYPE email_campaign_status AS ENUM (
  'draft',
  'previewed',
  'queued',
  'sending',
  'sent',
  'partially_failed',
  'failed'
);
CREATE TYPE email_recipient_status AS ENUM (
  'pending',
  'skipped_unsubscribed',
  'skipped_suppressed',
  'queued',
  'sent',
  'delivered',
  'delivery_delayed',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed',
  'replied'
);
CREATE TYPE email_event_type AS ENUM (
  'created',
  'previewed',
  'queued',
  'sent',
  'delivered',
  'delivery_delayed',
  'opened',
  'clicked',
  'bounced',
  'complained',
  'failed',
  'unsubscribed',
  'suppressed',
  'reply_received',
  'reply_forwarded',
  'reply_forward_failed'
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
  builder_type text NOT NULL DEFAULT 'grapesjs_mjml',
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
  builder_json jsonb NOT NULL DEFAULT '{}'::jsonb,
  mjml text NOT NULL DEFAULT '',
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
  mime_type text NOT NULL CHECK (mime_type IN ('image/jpeg', 'image/png', 'image/gif')),
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

CREATE UNIQUE INDEX idx_email_suppressions_active_email
  ON email_suppressions (email)
  WHERE lifted_at IS NULL;

CREATE TABLE email_campaigns (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind email_campaign_kind NOT NULL,
  status email_campaign_status NOT NULL DEFAULT 'draft',
  name text NOT NULL CHECK (char_length(trim(name)) > 0 AND char_length(name) <= 160),
  subject text NOT NULL CHECK (char_length(trim(subject)) > 0 AND char_length(subject) <= 200),
  preview_text text NOT NULL DEFAULT '' CHECK (char_length(preview_text) <= 200),
  from_email text NOT NULL,
  from_name text NOT NULL DEFAULT 'Behind The Mask',
  reply_to_email text NOT NULL,
  template_version_id uuid REFERENCES email_template_versions(id),
  html_snapshot text NOT NULL DEFAULT '',
  text_snapshot text NOT NULL DEFAULT '',
  created_by uuid NOT NULL REFERENCES auth.users(id),
  updated_by uuid NOT NULL REFERENCES auth.users(id),
  confirmed_by uuid REFERENCES auth.users(id),
  confirmed_at timestamptz,
  recipient_count integer NOT NULL DEFAULT 0,
  sent_count integer NOT NULL DEFAULT 0,
  delivered_count integer NOT NULL DEFAULT 0,
  opened_count integer NOT NULL DEFAULT 0,
  clicked_count integer NOT NULL DEFAULT 0,
  bounced_count integer NOT NULL DEFAULT 0,
  complained_count integer NOT NULL DEFAULT 0,
  replied_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE email_campaign_recipients (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid NOT NULL REFERENCES email_campaigns(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  email text NOT NULL,
  contact_name_snapshot text NOT NULL DEFAULT '',
  personalization_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb,
  status email_recipient_status NOT NULL DEFAULT 'pending',
  provider text,
  provider_message_id text,
  provider_metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_error text,
  queued_at timestamptz,
  sent_at timestamptz,
  delivered_at timestamptz,
  opened_at timestamptz,
  clicked_at timestamptz,
  bounced_at timestamptz,
  complained_at timestamptz,
  replied_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (campaign_id, email)
);

CREATE INDEX idx_email_campaign_recipients_campaign_status
  ON email_campaign_recipients (campaign_id, status);
CREATE INDEX idx_email_campaign_recipients_contact
  ON email_campaign_recipients (contact_id, created_at DESC)
  WHERE contact_id IS NOT NULL;
CREATE UNIQUE INDEX idx_email_campaign_recipients_provider_message
  ON email_campaign_recipients (provider, provider_message_id)
  WHERE provider_message_id IS NOT NULL;

CREATE TABLE email_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES email_campaigns(id) ON DELETE CASCADE,
  recipient_id uuid REFERENCES email_campaign_recipients(id) ON DELETE CASCADE,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  type email_event_type NOT NULL,
  provider text,
  provider_event_id text,
  provider_message_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX idx_email_events_provider_event
  ON email_events (provider, provider_event_id)
  WHERE provider_event_id IS NOT NULL;
CREATE INDEX idx_email_events_recipient_occurred
  ON email_events (recipient_id, occurred_at DESC)
  WHERE recipient_id IS NOT NULL;
CREATE INDEX idx_email_events_contact_occurred
  ON email_events (contact_id, occurred_at DESC)
  WHERE contact_id IS NOT NULL;

CREATE TABLE email_replies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  campaign_id uuid REFERENCES email_campaigns(id) ON DELETE SET NULL,
  recipient_id uuid REFERENCES email_campaign_recipients(id) ON DELETE SET NULL,
  contact_id uuid REFERENCES contacts(id) ON DELETE SET NULL,
  provider text NOT NULL,
  provider_message_id text,
  provider_event_id text,
  inbound_to text NOT NULL,
  inbound_from text NOT NULL,
  subject text NOT NULL DEFAULT '',
  text_body text NOT NULL DEFAULT '',
  html_body text NOT NULL DEFAULT '',
  body_preview text NOT NULL DEFAULT '',
  attachment_metadata jsonb NOT NULL DEFAULT '[]'::jsonb,
  forwarded_to text NOT NULL,
  forwarded_at timestamptz,
  forward_status text NOT NULL DEFAULT 'pending' CHECK (forward_status IN ('pending', 'forwarded', 'failed')),
  forward_error text,
  received_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (provider, provider_event_id)
);

ALTER PUBLICATION supabase_realtime ADD TABLE email_campaigns;
ALTER PUBLICATION supabase_realtime ADD TABLE email_campaign_recipients;
ALTER PUBLICATION supabase_realtime ADD TABLE email_events;
ALTER PUBLICATION supabase_realtime ADD TABLE email_replies;

ALTER TABLE email_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_template_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_email_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_campaign_recipients ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE email_replies ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE profiles.id = auth.uid() AND profiles.role = 'admin'
  );
$$;

CREATE POLICY "Admins can read email_templates" ON email_templates FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write email_templates" ON email_templates FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can read email_template_versions" ON email_template_versions FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write email_template_versions" ON email_template_versions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can read email_assets" ON email_assets FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write email_assets" ON email_assets FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can read contact_email_preferences" ON contact_email_preferences FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write contact_email_preferences" ON contact_email_preferences FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can read email_suppressions" ON email_suppressions FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write email_suppressions" ON email_suppressions FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can read email_campaigns" ON email_campaigns FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write email_campaigns" ON email_campaigns FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can read email_campaign_recipients" ON email_campaign_recipients FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write email_campaign_recipients" ON email_campaign_recipients FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can read email_events" ON email_events FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write email_events" ON email_events FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Admins can read email_replies" ON email_replies FOR SELECT USING (public.is_admin());
CREATE POLICY "Admins can write email_replies" ON email_replies FOR ALL USING (public.is_admin()) WITH CHECK (public.is_admin());

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-assets',
  'email-assets',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/gif']::text[]
)
ON CONFLICT (id) DO UPDATE SET
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

CREATE POLICY "Public can read email assets"
ON storage.objects FOR SELECT
USING (bucket_id = 'email-assets');

CREATE POLICY "Admins can manage email assets"
ON storage.objects FOR ALL
USING (bucket_id = 'email-assets' AND public.is_admin())
WITH CHECK (bucket_id = 'email-assets' AND public.is_admin());
