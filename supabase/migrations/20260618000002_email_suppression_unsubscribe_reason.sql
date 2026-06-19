-- Email studio redesign — Phase 2: flat exclusion.
--
-- Unsubscribing now lands a person on the single exclusion list (email_suppressions),
-- which the eligibility checks + queue/claim RPCs already honor for BOTH broadcast
-- and outreach. A dedicated reason distinguishes self-service unsubscribes from
-- bounces, complaints, and manual admin exclusions in the Excluded UI.
--
-- ADD VALUE runs in its own migration (and is never used in the same transaction),
-- which keeps it compatible with the migration runner's transaction handling.

ALTER TYPE email_suppression_reason ADD VALUE IF NOT EXISTS 'unsubscribe';
