-- Per-contact activity summary for the admin contacts table.
-- security_invoker keeps RLS on contacts, contact_events, and applications
-- in force for callers of the view.

CREATE OR REPLACE VIEW contact_activity_summary
WITH (security_invoker = true) AS
WITH latest_events AS (
  SELECT DISTINCT ON (contact_id)
    contact_id,
    type AS last_event_type,
    custom_label AS last_event_custom_label,
    happened_at AS last_event_at
  FROM contact_events
  ORDER BY contact_id, happened_at DESC
),
pending_events AS (
  SELECT
    contact_id,
    bool_or(type = 'info_requested' AND resolved_at IS NULL) AS awaiting_applicant,
    bool_or(type = 'awaiting_btm_response' AND resolved_at IS NULL) AS awaiting_btm
  FROM contact_events
  WHERE type IN ('info_requested', 'awaiting_btm_response')
  GROUP BY contact_id
),
latest_applications AS (
  SELECT
    contact_id,
    max(submitted_at) AS latest_app_submitted_at
  FROM applications
  WHERE contact_id IS NOT NULL
  GROUP BY contact_id
)
SELECT
  c.id AS contact_id,
  le.last_event_type,
  le.last_event_custom_label,
  le.last_event_at,
  COALESCE(pe.awaiting_applicant, false) AS awaiting_applicant,
  COALESCE(pe.awaiting_btm, false) AS awaiting_btm,
  la.latest_app_submitted_at
FROM contacts c
LEFT JOIN latest_events le ON le.contact_id = c.id
LEFT JOIN pending_events pe ON pe.contact_id = c.id
LEFT JOIN latest_applications la ON la.contact_id = c.id;
