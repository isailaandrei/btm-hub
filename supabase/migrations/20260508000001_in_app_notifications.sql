CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipient_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  actor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('dm_message')),
  entity_type text NOT NULL CHECK (entity_type IN ('dm_message')),
  entity_id uuid NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS notifications_recipient_type_entity_key
  ON public.notifications (recipient_id, type, entity_id);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_created
  ON public.notifications (recipient_id, created_at DESC, id DESC);

CREATE INDEX IF NOT EXISTS idx_notifications_recipient_unread
  ON public.notifications (recipient_id, created_at DESC, id DESC)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_dm_conversation
  ON public.notifications ((metadata ->> 'conversation_id'))
  WHERE type = 'dm_message';

ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own notifications"
  ON public.notifications
  FOR SELECT
  USING (auth.uid() = recipient_id);

CREATE POLICY "Users can update own notifications"
  ON public.notifications
  FOR UPDATE
  USING (auth.uid() = recipient_id)
  WITH CHECK (auth.uid() = recipient_id);

CREATE POLICY "Users can create notifications for own sent DM messages"
  ON public.notifications
  FOR INSERT
  WITH CHECK (
    auth.uid() = actor_id
    AND recipient_id <> auth.uid()
    AND type = 'dm_message'
    AND entity_type = 'dm_message'
    AND EXISTS (
      SELECT 1
      FROM public.dm_messages m
      JOIN public.dm_conversations c ON c.id = m.conversation_id
      WHERE m.id = entity_id
        AND m.sender_id = auth.uid()
        AND (recipient_id = c.user1_id OR recipient_id = c.user2_id)
        AND recipient_id <> auth.uid()
        AND metadata ->> 'conversation_id' = c.id::text
    )
  );

GRANT SELECT, INSERT, UPDATE ON public.notifications TO authenticated;
GRANT ALL ON public.notifications TO service_role;

CREATE OR REPLACE FUNCTION public.get_latest_forum_threads_by_topic(
  _threads_per_topic integer DEFAULT 3
)
RETURNS TABLE (
  topic_slug text,
  topic_name text,
  topic_description text,
  topic_icon text,
  topic_sort_order integer,
  thread_id uuid,
  thread_author_id uuid,
  thread_title text,
  thread_slug text,
  thread_reply_count integer,
  thread_pinned boolean,
  thread_locked boolean,
  thread_created_at timestamptz,
  thread_last_reply_at timestamptz,
  op_post_id uuid,
  body_preview text,
  op_body text,
  op_body_format text,
  op_like_count integer,
  author_display_name text,
  author_avatar_url text
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH ranked_threads AS (
    SELECT
      listings.*,
      row_number() OVER (
        PARTITION BY listings.topic
        ORDER BY listings.pinned DESC, listings.last_reply_at DESC, listings.id DESC
      ) AS thread_rank
    FROM public.forum_thread_listings AS listings
    WHERE listings.topic IS NOT NULL
  )
  SELECT
    topics.slug AS topic_slug,
    topics.name AS topic_name,
    topics.description AS topic_description,
    topics.icon AS topic_icon,
    topics.sort_order AS topic_sort_order,
    ranked_threads.id AS thread_id,
    ranked_threads.author_id AS thread_author_id,
    ranked_threads.title AS thread_title,
    ranked_threads.slug AS thread_slug,
    ranked_threads.reply_count AS thread_reply_count,
    ranked_threads.pinned AS thread_pinned,
    ranked_threads.locked AS thread_locked,
    ranked_threads.created_at AS thread_created_at,
    ranked_threads.last_reply_at AS thread_last_reply_at,
    ranked_threads.op_post_id,
    ranked_threads.body_preview,
    ranked_threads.op_body,
    ranked_threads.op_body_format,
    ranked_threads.op_like_count,
    profiles.display_name AS author_display_name,
    profiles.avatar_url AS author_avatar_url
  FROM public.forum_topics AS topics
  JOIN ranked_threads ON ranked_threads.topic = topics.slug
  LEFT JOIN public.profiles ON profiles.id = ranked_threads.author_id
  WHERE ranked_threads.thread_rank <= greatest(_threads_per_topic, 0)
  ORDER BY topics.sort_order ASC, topics.slug ASC, ranked_threads.thread_rank ASC;
$$;

GRANT EXECUTE ON FUNCTION public.get_latest_forum_threads_by_topic(integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_forum_threads_by_topic(integer) TO service_role;
