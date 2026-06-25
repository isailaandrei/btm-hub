-- Replace the WhatsApp ingestion provider from Twilio to YCloud.
-- conversation_messages.provider was constrained to ('twilio'); the inbound
-- WhatsApp pipeline now runs through YCloud, so swap the check to ('ycloud').
-- The table is empty (no 'twilio' rows exist), so this is a clean replacement.

alter table public.conversation_messages
  drop constraint if exists conversation_messages_provider_check;

alter table public.conversation_messages
  add constraint conversation_messages_provider_check
  check (provider in ('ycloud'));
