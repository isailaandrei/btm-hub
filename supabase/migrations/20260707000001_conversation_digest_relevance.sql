-- Relevance taxonomy for signal digests.
--
-- The signal/noise binary was too coarse: signal splits into PROFILE (durable,
-- kept in the AI's memory permanently) and STATUS (operational, ages out of the
-- AI's view after a trip cycle). Noise rows keep relevance null; signal digests
-- set 'profile' or 'status'. The AI read path keeps a digest when it is
-- is_noise = false AND (relevance = 'profile' OR window_end is within the status
-- freshness window).

alter table public.conversation_digests
  add column if not exists relevance text
  check (relevance in ('profile', 'status'));

-- Extend the signal index to carry relevance so the read filter
-- (is_noise = false AND (relevance = 'profile' OR window_end >= cutoff)) is
-- served without a heap lookup for the relevance test.
drop index if exists idx_conversation_digests_signal;
create index if not exists idx_conversation_digests_signal
  on public.conversation_digests (contact_id, window_end desc, relevance)
  where is_noise = false;
