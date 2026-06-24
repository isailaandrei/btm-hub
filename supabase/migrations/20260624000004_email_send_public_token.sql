-- "View in browser" web version: a stable, unguessable public token per send.
-- A volatile default backfills new AND existing rows with distinct tokens, so no
-- application or RPC change is needed to mint one. UUID = 122 bits of entropy,
-- not enumerable.
alter table public.email_sends
  add column if not exists public_token text not null default gen_random_uuid()::text;

create unique index if not exists email_sends_public_token_key
  on public.email_sends (public_token);
