ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_entity_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('dm_message', 'stream_message'));

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_entity_type_check
  CHECK (entity_type IN ('dm_message', 'stream_message'));

CREATE UNIQUE INDEX IF NOT EXISTS notifications_stream_message_recipient_unique
  ON public.notifications (recipient_id, ((metadata ->> 'stream_message_id')))
  WHERE type = 'stream_message';

CREATE INDEX IF NOT EXISTS idx_notifications_stream_channel
  ON public.notifications ((metadata ->> 'stream_channel_cid'))
  WHERE type = 'stream_message';
