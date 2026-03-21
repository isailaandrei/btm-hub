-- ============================================================================
-- Forum tables: forum_threads + forum_posts
-- Two-level threading (threads -> flat replies), public read, auth to post
-- ============================================================================

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."forum_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid",
    "topic" "text" NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "body" "text" NOT NULL,
    "reply_count" integer DEFAULT 0 NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_reply_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "forum_threads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "forum_threads_topic_slug_key" UNIQUE ("topic", "slug"),
    CONSTRAINT "forum_threads_topic_check" CHECK (
        "topic" = ANY (ARRAY[
            'trip-reports'::text,
            'underwater-filmmaking-photography'::text,
            'gear-talk'::text,
            'marine-life'::text,
            'freediving'::text,
            'beginner-questions'::text
        ])
    ),
    CONSTRAINT "forum_threads_title_length" CHECK (
        char_length("title") >= 3 AND char_length("title") <= 200
    ),
    CONSTRAINT "forum_threads_slug_format" CHECK (
        "slug" ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' AND char_length("slug") <= 86
    ),
    CONSTRAINT "forum_threads_body_length" CHECK (
        char_length("body") >= 1 AND char_length("body") <= 20000
    )
);

ALTER TABLE "public"."forum_threads" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."forum_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "forum_posts_body_length" CHECK (
        char_length("body") >= 1 AND char_length("body") <= 10000
    )
);

ALTER TABLE "public"."forum_posts" OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- Foreign keys
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_author_profile_fkey"
    FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id")
    ON DELETE SET NULL;

ALTER TABLE "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_thread_fkey"
    FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id")
    ON DELETE CASCADE;

ALTER TABLE "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_author_profile_fkey"
    FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id")
    ON DELETE SET NULL;

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- Topic thread listing with pinned-first, then by activity (cursor tiebreaker: id)
CREATE INDEX "idx_forum_threads_topic_listing"
    ON "public"."forum_threads" ("topic", "pinned" DESC, "last_reply_at" DESC, "id" DESC);

-- Global recent threads (cursor tiebreaker: id)
CREATE INDEX "idx_forum_threads_recent"
    ON "public"."forum_threads" ("last_reply_at" DESC, "id" DESC);

-- Reply listing for a thread (cursor tiebreaker: id)
CREATE INDEX "idx_forum_posts_thread_listing"
    ON "public"."forum_posts" ("thread_id", "created_at" ASC, "id" ASC);

-- User's posts lookup
CREATE INDEX "idx_forum_threads_author" ON "public"."forum_threads" ("author_id");
CREATE INDEX "idx_forum_posts_author" ON "public"."forum_posts" ("author_id");

-- --------------------------------------------------------------------------
-- Trigger: reply count + last_reply_at
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
    -- Determine which thread to update
    IF TG_OP = 'DELETE' THEN
        _thread_id := OLD.thread_id;
    ELSE
        _thread_id := NEW.thread_id;
    END IF;

    -- Lock the thread row to prevent concurrent update races
    PERFORM 1 FROM public.forum_threads WHERE id = _thread_id FOR UPDATE;

    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_threads
        SET reply_count = reply_count + 1,
            last_reply_at = NEW.created_at
        WHERE id = _thread_id;

    ELSIF TG_OP = 'DELETE' THEN
        -- Recalculate last_reply_at from remaining posts, fallback to thread created_at
        SELECT COALESCE(MAX(fp.created_at), ft.created_at)
        INTO _last_reply
        FROM public.forum_threads ft
        LEFT JOIN public.forum_posts fp ON fp.thread_id = ft.id
        WHERE ft.id = _thread_id;

        UPDATE public.forum_threads
        SET reply_count = GREATEST(reply_count - 1, 0),
            last_reply_at = _last_reply
        WHERE id = _thread_id;
    END IF;

    RETURN NULL; -- AFTER trigger
END;
$$;

ALTER FUNCTION "public"."forum_update_thread_reply_stats"() OWNER TO "postgres";

CREATE TRIGGER "forum_posts_reply_stats"
    AFTER INSERT OR DELETE ON "public"."forum_posts"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."forum_update_thread_reply_stats"();

-- --------------------------------------------------------------------------
-- RPCs: pin/lock (admin-only, SECURITY INVOKER)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."toggle_thread_pin"("_thread_id" "uuid")
    RETURNS void
    LANGUAGE "plpgsql"
    SECURITY INVOKER
    AS $$
BEGIN
    -- Check caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: admin only';
    END IF;

    UPDATE public.forum_threads
    SET pinned = NOT pinned
    WHERE id = _thread_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Thread not found';
    END IF;
END;
$$;

ALTER FUNCTION "public"."toggle_thread_pin"("_thread_id" "uuid") OWNER TO "postgres";

CREATE OR REPLACE FUNCTION "public"."toggle_thread_lock"("_thread_id" "uuid")
    RETURNS void
    LANGUAGE "plpgsql"
    SECURITY INVOKER
    AS $$
BEGIN
    -- Check caller is admin
    IF NOT EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RAISE EXCEPTION 'Unauthorized: admin only';
    END IF;

    UPDATE public.forum_threads
    SET locked = NOT locked
    WHERE id = _thread_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Thread not found';
    END IF;
END;
$$;

ALTER FUNCTION "public"."toggle_thread_lock"("_thread_id" "uuid") OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."forum_posts" ENABLE ROW LEVEL SECURITY;

-- SELECT: public read
CREATE POLICY "Forum threads are publicly readable"
    ON "public"."forum_threads" FOR SELECT
    USING (true);

CREATE POLICY "Forum posts are publicly readable"
    ON "public"."forum_posts" FOR SELECT
    USING (true);

-- INSERT: authenticated, must be own author_id
CREATE POLICY "Authenticated users can create threads"
    ON "public"."forum_threads" FOR INSERT
    WITH CHECK ("auth"."uid"() = "author_id");

CREATE POLICY "Authenticated users can reply to unlocked threads"
    ON "public"."forum_posts" FOR INSERT
    WITH CHECK (
        "auth"."uid"() = "author_id"
        AND NOT EXISTS (
            SELECT 1 FROM "public"."forum_threads"
            WHERE "id" = "thread_id" AND "locked" = true
        )
    );

-- Admin INSERT: admins can reply even to locked threads
CREATE POLICY "Admins can reply to any thread"
    ON "public"."forum_posts" FOR INSERT
    WITH CHECK (
        EXISTS (
            SELECT 1 FROM "public"."profiles"
            WHERE "profiles"."id" = "auth"."uid"() AND "profiles"."role" = 'admin'
        )
    );

-- UPDATE own: can only update body + updated_at (not pinned/locked/title/slug)
CREATE POLICY "Users can update own threads"
    ON "public"."forum_threads" FOR UPDATE
    USING ("auth"."uid"() = "author_id")
    WITH CHECK (
        "auth"."uid"() = "author_id"
    );

CREATE POLICY "Users can update own posts"
    ON "public"."forum_posts" FOR UPDATE
    USING ("auth"."uid"() = "author_id")
    WITH CHECK ("auth"."uid"() = "author_id");

-- Admin UPDATE: unrestricted
CREATE POLICY "Admins can update any thread"
    ON "public"."forum_threads" FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"() AND "profiles"."role" = 'admin'
    ));

CREATE POLICY "Admins can update any post"
    ON "public"."forum_posts" FOR UPDATE
    USING (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"() AND "profiles"."role" = 'admin'
    ));

-- DELETE own
CREATE POLICY "Users can delete own threads"
    ON "public"."forum_threads" FOR DELETE
    USING ("auth"."uid"() = "author_id");

CREATE POLICY "Users can delete own posts"
    ON "public"."forum_posts" FOR DELETE
    USING ("auth"."uid"() = "author_id");

-- Admin DELETE: unrestricted
CREATE POLICY "Admins can delete any thread"
    ON "public"."forum_threads" FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"() AND "profiles"."role" = 'admin'
    ));

CREATE POLICY "Admins can delete any post"
    ON "public"."forum_posts" FOR DELETE
    USING (EXISTS (
        SELECT 1 FROM "public"."profiles"
        WHERE "profiles"."id" = "auth"."uid"() AND "profiles"."role" = 'admin'
    ));

-- --------------------------------------------------------------------------
-- Grants (matches existing pattern)
-- --------------------------------------------------------------------------

GRANT SELECT ON TABLE "public"."forum_threads" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."forum_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_threads" TO "service_role";

GRANT SELECT ON TABLE "public"."forum_posts" TO "anon";
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."forum_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_posts" TO "service_role";
