CREATE TABLE IF NOT EXISTS public.chat_threads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  kind text NOT NULL CHECK (kind IN ('direct')),
  provider text NOT NULL CHECK (provider IN ('stream')),
  provider_channel_id text NOT NULL,
  provider_channel_cid text NOT NULL,
  direct_participant_key text NOT NULL,
  created_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.chat_thread_participants (
  thread_id uuid NOT NULL REFERENCES public.chat_threads(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, profile_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_direct_participant_key_unique
  ON public.chat_threads (direct_participant_key)
  WHERE kind = 'direct';

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_provider_cid_unique
  ON public.chat_threads (provider, provider_channel_cid);

CREATE UNIQUE INDEX IF NOT EXISTS chat_threads_provider_channel_id_unique
  ON public.chat_threads (provider, provider_channel_id);

CREATE INDEX IF NOT EXISTS idx_chat_thread_participants_profile
  ON public.chat_thread_participants (profile_id, thread_id);

CREATE OR REPLACE FUNCTION public.chat_threads_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS chat_threads_set_updated_at_trg ON public.chat_threads;

CREATE TRIGGER chat_threads_set_updated_at_trg
  BEFORE UPDATE ON public.chat_threads
  FOR EACH ROW
  EXECUTE FUNCTION public.chat_threads_set_updated_at();

ALTER TABLE public.chat_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chat_thread_participants ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view chat threads they participate in"
  ON public.chat_threads;

CREATE POLICY "Users can view chat threads they participate in"
  ON public.chat_threads
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.chat_thread_participants participant
      WHERE participant.thread_id = chat_threads.id
        AND participant.profile_id = (SELECT auth.uid())
    )
  );

DROP POLICY IF EXISTS "Users can view own chat thread participant rows"
  ON public.chat_thread_participants;

CREATE POLICY "Users can view own chat thread participant rows"
  ON public.chat_thread_participants
  FOR SELECT
  TO authenticated
  USING (profile_id = (SELECT auth.uid()));

GRANT SELECT ON public.chat_threads TO authenticated;
GRANT SELECT ON public.chat_thread_participants TO authenticated;
GRANT ALL ON public.chat_threads TO service_role;
GRANT ALL ON public.chat_thread_participants TO service_role;

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

DROP INDEX IF EXISTS public.notifications_recipient_type_entity_key;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_recipient_dm_message_entity_key
  ON public.notifications (recipient_id, type, entity_id)
  WHERE type = 'dm_message';

DROP INDEX IF EXISTS public.notifications_stream_message_recipient_unique;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_stream_message_recipient_unique
  ON public.notifications (recipient_id, ((metadata ->> 'stream_message_id')))
  WHERE type = 'stream_message'
    AND metadata ? 'stream_message_id';

CREATE INDEX IF NOT EXISTS idx_notifications_stream_thread
  ON public.notifications ((metadata ->> 'thread_id'))
  WHERE type = 'stream_message';

CREATE INDEX IF NOT EXISTS idx_notifications_stream_channel
  ON public.notifications ((metadata ->> 'stream_channel_cid'))
  WHERE type = 'stream_message';
