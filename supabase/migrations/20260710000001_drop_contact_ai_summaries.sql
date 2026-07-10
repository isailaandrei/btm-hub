-- Drop the dormant per-contact AI-summary table (queue task 1c cleanup).
--
-- The feature was withdrawn by the owner 2026-07-09 (opus-task-queue §1c): it
-- was a misunderstanding — the owner wanted the WhatsApp digest display (task
-- 1b), which already existed. The summary UI was removed in b58ae92, nothing
-- reads this table, its cron route was never scheduled, and the generator code
-- is deleted in the same commit as this migration. The ~309 rows it holds were
-- an unaudited first batch that never shipped to admins; dropping them is
-- intentional.

DROP TABLE IF EXISTS contact_ai_summaries;
