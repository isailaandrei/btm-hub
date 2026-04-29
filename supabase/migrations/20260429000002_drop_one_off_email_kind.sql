UPDATE email_campaigns
SET kind = 'outreach'
WHERE kind = 'one_off';

ALTER TYPE email_campaign_kind RENAME TO email_campaign_kind_old;

CREATE TYPE email_campaign_kind AS ENUM ('broadcast', 'outreach');

ALTER TABLE email_campaigns
  ALTER COLUMN kind TYPE email_campaign_kind
  USING kind::text::email_campaign_kind;

DROP TYPE email_campaign_kind_old;
