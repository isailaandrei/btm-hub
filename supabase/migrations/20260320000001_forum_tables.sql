-- ============================================================================
-- Forum tables: forum_topics + forum_threads + forum_posts
-- Two-level threading (threads -> flat replies), public read, auth to post
-- ============================================================================

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

-- Change 3: Forum topics reference table (replaces CHECK constraint)
CREATE TABLE IF NOT EXISTS "public"."forum_topics" (
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" NOT NULL DEFAULT '',
    "icon" "text" NOT NULL DEFAULT '',
    "sort_order" integer NOT NULL DEFAULT 0,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "forum_topics_pkey" PRIMARY KEY ("slug")
);

ALTER TABLE "public"."forum_topics" OWNER TO "postgres";

-- Seed forum topics
INSERT INTO "public"."forum_topics" ("slug", "name", "description", "icon", "sort_order") VALUES
    ('trip-reports', 'Trip Reports', 'Share your dive adventures and trip experiences from around the world.', '🌍', 0),
    ('underwater-filmmaking-photography', 'Underwater Filmmaking & Photography', 'Techniques, critiques, and inspiration for shooting beneath the surface.', '📸', 1),
    ('gear-talk', 'Gear Talk', 'Discuss cameras, housings, lights, fins, and everything in between.', '🔧', 2),
    ('marine-life', 'Marine Life', 'Identify species, share sightings, and discuss ocean conservation.', '🐠', 3),
    ('freediving', 'Freediving', 'Training tips, breath-hold techniques, and freediving stories.', '🤿', 4),
    ('beginner-questions', 'Beginner Questions', 'New to diving or underwater content creation? Ask anything here.', '💬', 5);

-- Change 2: Removed "body" column from forum_threads (body is now in the OP forum_post)
CREATE TABLE IF NOT EXISTS "public"."forum_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid",
    "topic" "text" NOT NULL,
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "reply_count" integer DEFAULT 0 NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_reply_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "forum_threads_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "forum_threads_topic_slug_key" UNIQUE ("topic", "slug"),
    CONSTRAINT "forum_threads_title_length" CHECK (
        char_length("title") >= 3 AND char_length("title") <= 200
    ),
    CONSTRAINT "forum_threads_slug_format" CHECK (
        "slug" ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$' AND char_length("slug") <= 86
    )
);

ALTER TABLE "public"."forum_threads" OWNER TO "postgres";

-- Change 2: Added is_op column, Change 4: Added body_preview generated column
-- Body limit raised to 20000 to accommodate OP posts (app-level Zod enforces 10000 for replies)
CREATE TABLE IF NOT EXISTS "public"."forum_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "is_op" boolean NOT NULL DEFAULT false,
    "body_preview" "text" GENERATED ALWAYS AS (left("body", 200)) STORED,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "forum_posts_body_length" CHECK (
        char_length("body") >= 1 AND char_length("body") <= 20000
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

-- Change 3: FK from forum_threads.topic to forum_topics.slug
ALTER TABLE "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_topic_fkey"
    FOREIGN KEY ("topic") REFERENCES "public"."forum_topics"("slug");

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

-- OP lookup for a thread (used by forum_thread_listings view)
CREATE UNIQUE INDEX "idx_forum_posts_thread_op"
    ON "public"."forum_posts" ("thread_id") WHERE "is_op" = true;

-- User's posts lookup
CREATE INDEX "idx_forum_threads_author" ON "public"."forum_threads" ("author_id");
CREATE INDEX "idx_forum_posts_author" ON "public"."forum_posts" ("author_id");

-- --------------------------------------------------------------------------
-- View: forum_thread_listings (joins thread with OP body_preview)
-- --------------------------------------------------------------------------

CREATE VIEW "public"."forum_thread_listings" AS
SELECT ft.*, fp."body_preview"
FROM "public"."forum_threads" ft
LEFT JOIN "public"."forum_posts" fp ON fp."thread_id" = ft."id" AND fp."is_op" = true;

ALTER VIEW "public"."forum_thread_listings" OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- Trigger: reply count + last_reply_at (excludes OP posts)
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

    -- Skip OP posts — they don't count as replies
    IF TG_OP = 'INSERT' AND NEW.is_op THEN
        RETURN NULL;
    END IF;
    IF TG_OP = 'DELETE' AND OLD.is_op THEN
        RETURN NULL;
    END IF;

    -- Lock the thread row to prevent concurrent update races
    PERFORM 1 FROM public.forum_threads WHERE id = _thread_id FOR UPDATE;

    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_threads
        SET reply_count = reply_count + 1,
            last_reply_at = NEW.created_at
        WHERE id = _thread_id;

    ELSIF TG_OP = 'DELETE' THEN
        -- Recalculate last_reply_at from remaining non-OP posts, fallback to thread created_at
        SELECT COALESCE(MAX(fp.created_at), ft.created_at)
        INTO _last_reply
        FROM public.forum_threads ft
        LEFT JOIN public.forum_posts fp ON fp.thread_id = ft.id AND fp.is_op = false
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
-- Change 1: BEFORE UPDATE triggers to restrict column changes for non-admins
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."forum_restrict_thread_update"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
BEGIN
    -- Admins can update any column
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN NEW;
    END IF;

    -- Non-admins: reset protected columns to their OLD values
    NEW.title := OLD.title;
    NEW.slug := OLD.slug;
    NEW.topic := OLD.topic;
    NEW.pinned := OLD.pinned;
    NEW.locked := OLD.locked;
    NEW.reply_count := OLD.reply_count;
    NEW.last_reply_at := OLD.last_reply_at;

    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."forum_restrict_thread_update"() OWNER TO "postgres";

CREATE TRIGGER "forum_threads_restrict_update"
    BEFORE UPDATE ON "public"."forum_threads"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."forum_restrict_thread_update"();

CREATE OR REPLACE FUNCTION "public"."forum_restrict_post_update"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
BEGIN
    -- Admins can update any column
    IF EXISTS (
        SELECT 1 FROM public.profiles
        WHERE id = auth.uid() AND role = 'admin'
    ) THEN
        RETURN NEW;
    END IF;

    -- Non-admins: prevent moving posts between threads
    NEW.thread_id := OLD.thread_id;

    RETURN NEW;
END;
$$;

ALTER FUNCTION "public"."forum_restrict_post_update"() OWNER TO "postgres";

CREATE TRIGGER "forum_posts_restrict_update"
    BEFORE UPDATE ON "public"."forum_posts"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."forum_restrict_post_update"();

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

ALTER TABLE "public"."forum_topics" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."forum_threads" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."forum_posts" ENABLE ROW LEVEL SECURITY;

-- forum_topics: read-only for authenticated users
CREATE POLICY "Authenticated users can read topics"
    ON "public"."forum_topics" FOR SELECT
    USING ("auth"."uid"() IS NOT NULL);

-- SELECT: authenticated only
CREATE POLICY "Authenticated users can read threads"
    ON "public"."forum_threads" FOR SELECT
    USING ("auth"."uid"() IS NOT NULL);

CREATE POLICY "Authenticated users can read posts"
    ON "public"."forum_posts" FOR SELECT
    USING ("auth"."uid"() IS NOT NULL);

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
-- Column restriction enforced by BEFORE UPDATE trigger
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

GRANT SELECT ON TABLE "public"."forum_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_topics" TO "service_role";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."forum_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_threads" TO "service_role";

GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE "public"."forum_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_posts" TO "service_role";

GRANT SELECT ON "public"."forum_thread_listings" TO "authenticated";
GRANT SELECT ON "public"."forum_thread_listings" TO "service_role";
