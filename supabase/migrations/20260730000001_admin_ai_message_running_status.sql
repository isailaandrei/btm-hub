-- Start-and-poll ask flow (docs/plans/admin-ai-start-and-poll.md): the
-- placeholder assistant row is inserted status='running' and updated in place
-- when the after()-continuation finishes, so the client can poll one stable
-- message id. Widen the status check to accept it (additive — existing rows
-- and the 'complete'/'failed' writers are unaffected).
alter table public.admin_ai_messages
  drop constraint admin_ai_messages_status_check;
alter table public.admin_ai_messages
  add constraint admin_ai_messages_status_check
  check (status in ('complete', 'failed', 'running'));
