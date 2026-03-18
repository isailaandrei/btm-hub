-- Remove unused status values from the applications status check constraint.
-- TypeScript ApplicationStatus type already only allows: reviewing, accepted, rejected.

-- Safety: update any rows that might use the removed statuses
UPDATE public.applications SET status = 'reviewing' WHERE status IN ('new', 'waitlisted');

ALTER TABLE public.applications
  DROP CONSTRAINT IF EXISTS applications_status_check;

ALTER TABLE public.applications
  ADD CONSTRAINT applications_status_check
  CHECK (status = ANY (ARRAY['reviewing'::text, 'accepted'::text, 'rejected'::text]));
