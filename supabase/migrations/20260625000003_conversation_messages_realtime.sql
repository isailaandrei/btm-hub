-- Enable Supabase Realtime for conversation_messages so the contact detail
-- WhatsApp thread live-appends new inbound messages. The existing RLS policy
-- "Admins can read conversation messages" (profiles.role = 'admin') is honored
-- by Realtime, so only admins receive changes.
-- Idempotent: guarded so re-running (local hook + remote push) is a no-op.
do $$
begin
  if not exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'conversation_messages'
  ) then
    alter publication supabase_realtime add table public.conversation_messages;
  end if;
end $$;
