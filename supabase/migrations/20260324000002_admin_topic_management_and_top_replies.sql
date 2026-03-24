-- ============================================================================
-- 1. Allow admins to manage forum_topics (INSERT, UPDATE, DELETE)
-- 2. RPC: get top replies per thread (for feed card previews)
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Admin topic management
-- --------------------------------------------------------------------------

-- Grant INSERT/UPDATE/DELETE on forum_topics to authenticated role
GRANT INSERT, UPDATE, DELETE ON TABLE "public"."forum_topics" TO "authenticated";

-- Admin INSERT policy
CREATE POLICY "Admins can create topics"
    ON "public"."forum_topics" FOR INSERT
    WITH CHECK (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"() AND "profiles"."role" = 'admin'
    ));

-- Admin UPDATE policy
CREATE POLICY "Admins can update topics"
    ON "public"."forum_topics" FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"() AND "profiles"."role" = 'admin'
    ));

-- Admin DELETE policy
CREATE POLICY "Admins can delete topics"
    ON "public"."forum_topics" FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"() AND "profiles"."role" = 'admin'
    ));

-- --------------------------------------------------------------------------
-- 2. RPC: Get top N replies per thread (ordered by like_count)
--    Used to show inline comment previews on the feed.
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."get_top_replies_by_threads"(
    _thread_ids uuid[],
    _limit_per_thread int DEFAULT 2
)
RETURNS TABLE (
    id uuid,
    thread_id uuid,
    author_id uuid,
    body text,
    body_format text,
    body_preview text,
    like_count int,
    created_at timestamptz,
    updated_at timestamptz,
    author_display_name text,
    author_avatar_url text
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
    SELECT r.id, r.thread_id, r.author_id, r.body, r.body_format::text,
           r.body_preview, r.like_count, r.created_at, r.updated_at,
           p.display_name, p.avatar_url
    FROM (
        SELECT fp.*,
               ROW_NUMBER() OVER (
                   PARTITION BY fp.thread_id
                   ORDER BY fp.like_count DESC, fp.created_at ASC
               ) AS rn
        FROM public.forum_posts fp
        WHERE fp.thread_id = ANY(_thread_ids) AND fp.is_op = false
    ) r
    LEFT JOIN public.profiles p ON p.id = r.author_id
    WHERE r.rn <= _limit_per_thread;
$$;

ALTER FUNCTION "public"."get_top_replies_by_threads"(uuid[], int) OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- 3. Update forum_thread_listings view to include topic_name
-- --------------------------------------------------------------------------

DROP VIEW IF EXISTS "public"."forum_thread_listings";

CREATE VIEW "public"."forum_thread_listings"
WITH (security_invoker = true) AS
SELECT ft.*,
       fp."id" AS "op_post_id",
       fp."body_preview",
       fp."body" AS "op_body",
       fp."body_format" AS "op_body_format",
       fp."like_count" AS "op_like_count",
       fto."name" AS "topic_name"
FROM "public"."forum_threads" ft
LEFT JOIN "public"."forum_posts" fp ON fp."thread_id" = ft."id" AND fp."is_op" = true
LEFT JOIN "public"."forum_topics" fto ON fto."slug" = ft."topic";

ALTER VIEW "public"."forum_thread_listings" OWNER TO "postgres";
GRANT SELECT ON "public"."forum_thread_listings" TO "authenticated";
GRANT SELECT ON "public"."forum_thread_listings" TO "service_role";

-- --------------------------------------------------------------------------
-- 4. Recalculate reply_count for all threads (fix stale counts)
--    Must disable restrict trigger (it blocks updates without auth context)
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_threads" DISABLE TRIGGER "forum_threads_restrict_update";

UPDATE "public"."forum_threads" ft
SET reply_count = COALESCE(sub.cnt, 0)
FROM (
    SELECT thread_id, COUNT(*) AS cnt
    FROM "public"."forum_posts"
    WHERE is_op = false
    GROUP BY thread_id
) sub
WHERE sub.thread_id = ft.id
  AND ft.reply_count != sub.cnt;

ALTER TABLE "public"."forum_threads" ENABLE TRIGGER "forum_threads_restrict_update";

-- --------------------------------------------------------------------------
-- 5. Fix trigger: GROUP BY needed when mixing aggregate + non-aggregate cols
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."forum_update_thread_reply_stats"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
DECLARE
    _thread_id uuid;
    _last_reply timestamptz;
BEGIN
    IF TG_OP = 'DELETE' THEN
        _thread_id := OLD.thread_id;
    ELSE
        _thread_id := NEW.thread_id;
    END IF;

    -- Skip OP posts
    IF TG_OP = 'INSERT' AND NEW.is_op THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'DELETE' AND OLD.is_op THEN
        RETURN NULL;
    END IF;

    -- Lock the thread row
    PERFORM 1 FROM public.forum_threads WHERE id = _thread_id FOR UPDATE;

    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_threads
        SET reply_count = reply_count + 1,
            last_reply_at = NEW.created_at
        WHERE id = _thread_id;

    ELSIF TG_OP = 'DELETE' THEN
        SELECT COALESCE(MAX(fp.created_at), ft.created_at)
        INTO _last_reply
        FROM public.forum_threads ft
        LEFT JOIN public.forum_posts fp ON fp.thread_id = ft.id AND fp.is_op = false
        WHERE ft.id = _thread_id
        GROUP BY ft.created_at;

        UPDATE public.forum_threads
        SET reply_count = GREATEST(reply_count - 1, 0),
            last_reply_at = COALESCE(_last_reply, now())
        WHERE id = _thread_id;
    END IF;

    RETURN NULL;
END;
$$;
