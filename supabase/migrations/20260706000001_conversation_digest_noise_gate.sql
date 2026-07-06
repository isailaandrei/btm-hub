-- Noise gate for conversation digests.
--
-- A conversation window with no CRM signal (greetings, media-only, campaign
-- broadcasts with no reply) is recorded as a NOISE MARKER row — empty summary,
-- is_noise = true — rather than skipped. Writing the marker advances the
-- per-contact digest watermark (max window_end in list_undigested…), so the
-- window is never reprocessed, while `is_noise = false` filters it out of every
-- read path (contact cards). No facts and no embeddings are produced for noise.

alter table public.conversation_digests
  add column if not exists is_noise boolean not null default false;

-- The original inline CHECK forbade an empty summary. Noise rows legitimately
-- carry an empty summary, so relax it: signal digests still MUST be non-empty,
-- noise rows MAY be blank.
alter table public.conversation_digests
  drop constraint if exists conversation_digests_summary_check;

alter table public.conversation_digests
  add constraint conversation_digests_summary_check
  check (is_noise or btrim(summary) <> '');

-- Cards read only signal digests (is_noise = false); serve that common filter
-- from a partial index in the existing (contact_id, window_end desc) order.
create index if not exists idx_conversation_digests_signal
  on public.conversation_digests (contact_id, window_end desc)
  where is_noise = false;
