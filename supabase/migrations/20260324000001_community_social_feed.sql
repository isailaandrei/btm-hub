-- ============================================================================
-- Community social feed refactor
-- - forum_threads.topic becomes nullable (topics are optional tags)
-- - forum_posts.body_format discriminates markdown vs HTML (TipTap)
-- - body_preview regenerated with conditional HTML stripping
-- - Slug globally unique (no longer scoped to topic)
-- - forum_likes table with trigger-maintained like_count
-- - Updated restrict trigger protects like_count + body_format
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Make forum_threads.topic nullable
--    The existing FK to forum_topics.slug allows NULL by default
--    (Postgres FKs skip the check when the column value is NULL).
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_threads"
  ALTER COLUMN "topic" DROP NOT NULL;

-- --------------------------------------------------------------------------
-- 2. Add body_format column to forum_posts
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_posts"
  ADD COLUMN "body_format" "text" NOT NULL DEFAULT 'markdown'
  CONSTRAINT "forum_posts_body_format_check"
    CHECK ("body_format" IN ('markdown', 'html'));

-- --------------------------------------------------------------------------
-- 3. Regenerate body_preview with conditional HTML stripping
--    Must drop/recreate the view that references body_preview.
-- --------------------------------------------------------------------------

DROP VIEW IF EXISTS "public"."forum_thread_listings";

ALTER TABLE "public"."forum_posts" DROP COLUMN "body_preview";

ALTER TABLE "public"."forum_posts"
  ADD COLUMN "body_preview" "text" GENERATED ALWAYS AS (
    CASE WHEN "body_format" = 'html'
      THEN left(regexp_replace("body", '<[^>]*>', '', 'g'), 200)
      ELSE left("body", 200)
    END
  ) STORED;

CREATE VIEW "public"."forum_thread_listings"
WITH (security_invoker = true) AS
SELECT ft.*, fp."body_preview"
FROM "public"."forum_threads" ft
LEFT JOIN "public"."forum_posts" fp ON fp."thread_id" = ft."id" AND fp."is_op" = true;

ALTER VIEW "public"."forum_thread_listings" OWNER TO "postgres";
GRANT SELECT ON "public"."forum_thread_listings" TO "authenticated";
GRANT SELECT ON "public"."forum_thread_listings" TO "service_role";

-- --------------------------------------------------------------------------
-- 4. Global slug uniqueness
--    Deduplicate existing slugs, drop old composite constraint, add global.
-- --------------------------------------------------------------------------

-- Rename duplicate slugs before adding the unique constraint
WITH dupes AS (
  SELECT id, slug,
         ROW_NUMBER() OVER (PARTITION BY slug ORDER BY created_at) AS rn
  FROM "public"."forum_threads"
)
UPDATE "public"."forum_threads" ft
SET slug = ft.slug || '-' || substr(md5(ft.id::text), 1, 6)
FROM dupes
WHERE dupes.id = ft.id AND dupes.rn > 1;

-- Drop the old composite unique constraint
ALTER TABLE "public"."forum_threads"
  DROP CONSTRAINT "forum_threads_topic_slug_key";

-- Add global unique constraint
ALTER TABLE "public"."forum_threads"
  ADD CONSTRAINT "forum_threads_slug_unique" UNIQUE ("slug");

-- --------------------------------------------------------------------------
-- 5. Create forum_likes table
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."forum_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "forum_likes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "forum_likes_unique" UNIQUE ("post_id", "user_id"),
    CONSTRAINT "forum_likes_post_fkey"
      FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id")
      ON DELETE CASCADE,
    CONSTRAINT "forum_likes_user_fkey"
      FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
      ON DELETE CASCADE
);

ALTER TABLE "public"."forum_likes" OWNER TO "postgres";

CREATE INDEX "idx_forum_likes_post" ON "public"."forum_likes" ("post_id");
CREATE INDEX "idx_forum_likes_user" ON "public"."forum_likes" ("user_id");

-- --------------------------------------------------------------------------
-- 6. Add like_count to forum_posts with trigger
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_posts"
  ADD COLUMN "like_count" integer NOT NULL DEFAULT 0;

CREATE OR REPLACE FUNCTION "public"."forum_update_post_like_count"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
DECLARE
    _post_id uuid;
BEGIN
    IF TG_OP = 'DELETE' THEN
        _post_id := OLD.post_id;
    ELSE
        _post_id := NEW.post_id;
    END IF;

    -- Lock the post row to prevent concurrent update races
    PERFORM 1 FROM public.forum_posts WHERE id = _post_id FOR UPDATE;

    IF TG_OP = 'INSERT' THEN
        UPDATE public.forum_posts
        SET like_count = like_count + 1
        WHERE id = _post_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE public.forum_posts
        SET like_count = GREATEST(like_count - 1, 0)
        WHERE id = _post_id;
    END IF;

    RETURN NULL; -- AFTER trigger
END;
$$;

ALTER FUNCTION "public"."forum_update_post_like_count"() OWNER TO "postgres";

CREATE TRIGGER "forum_likes_count"
    AFTER INSERT OR DELETE ON "public"."forum_likes"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."forum_update_post_like_count"();

-- --------------------------------------------------------------------------
-- 7. RLS for forum_likes
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_likes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can read likes"
    ON "public"."forum_likes" FOR SELECT
    USING ("auth"."uid"() IS NOT NULL);

CREATE POLICY "Users can like posts"
    ON "public"."forum_likes" FOR INSERT
    WITH CHECK ("auth"."uid"() = "user_id");

CREATE POLICY "Users can unlike own likes"
    ON "public"."forum_likes" FOR DELETE
    USING ("auth"."uid"() = "user_id");

GRANT SELECT, INSERT, DELETE ON TABLE "public"."forum_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_likes" TO "service_role";

-- --------------------------------------------------------------------------
-- 8. Update forum_restrict_post_update trigger
--    Protect like_count AND body_format from direct user manipulation.
-- --------------------------------------------------------------------------

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
    -- Non-admins: prevent manipulating like_count directly
    NEW.like_count := OLD.like_count;
    -- Non-admins: prevent flipping body_format to bypass sanitization
    NEW.body_format := OLD.body_format;

    RETURN NEW;
END;
$$;
