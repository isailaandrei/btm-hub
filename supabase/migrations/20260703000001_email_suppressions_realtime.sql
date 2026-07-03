-- Enable Supabase Realtime for email_suppressions so the contact detail Email
-- section live-updates when another admin toggles do-not-email (or the email
-- pipeline records a bounce/unsubscribe). The section's channel filters on
-- contact_id and on email — suppressions created by the pipeline may carry an
-- email only. Existing admin-read RLS on the table is honored by Realtime, so
-- only admins receive changes.
-- Idempotent: guarded so re-running (local hook + remote push) is a no-op.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'email_suppressions'
  ) then
    alter publication supabase_realtime add table public.email_suppressions;
  end if;
end $$;
