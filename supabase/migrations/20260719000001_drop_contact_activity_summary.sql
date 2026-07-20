-- Drop the contact_activity_summary read model (admin /contacts perf Stage 0).
--
-- The view is recomputed on every /contacts load by scanning the growing
-- contact_events table — the main cause of the page's ~4s load. It had
-- exactly two consumers in the UI: the "Last activity" column and the
-- "awaiting applicant / awaiting BTM" filter chip. The owner decided both are
-- unused, so both consumers and all their plumbing were removed in the same
-- change as this migration (events-derivation.ts, last-activity-cell.tsx,
-- pending-filter.tsx, the activity_summary server sort source, and the
-- realtime refetch wiring in admin-data-provider.tsx). Nothing reads this
-- view anymore.

DROP VIEW IF EXISTS contact_activity_summary;
