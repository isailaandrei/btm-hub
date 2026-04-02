-- ============================================================================
-- Full-text search for forum threads and posts
-- Adds tsvector generated columns + GIN indexes for keyword search.
-- ============================================================================

-- --------------------------------------------------------------------------
-- 1. Helper: strip HTML tags from text (for HTML-format posts)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."html_strip_tags"("input" "text")
    RETURNS "text"
    LANGUAGE "sql"
    IMMUTABLE
    AS $$
    SELECT regexp_replace(input, '<[^>]*>', '', 'g');
$$;

ALTER FUNCTION "public"."html_strip_tags"("input" "text") OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- 2. Add tsvector column to forum_threads (indexes title)
-- --------------------------------------------------------------------------

ALTER TABLE "public"."forum_threads"
  ADD COLUMN "title_search" tsvector
  GENERATED ALWAYS AS (to_tsvector('english', "title")) STORED;

CREATE INDEX "idx_forum_threads_title_search"
  ON "public"."forum_threads" USING GIN ("title_search");

-- --------------------------------------------------------------------------
-- 3. Add tsvector column to forum_posts (indexes stripped body)
--    Must drop/recreate forum_thread_listings view because it uses ft.*
--    and adding a column to forum_threads changes the view's column set.
-- --------------------------------------------------------------------------

DROP VIEW IF EXISTS "public"."forum_thread_listings";

ALTER TABLE "public"."forum_posts"
  ADD COLUMN "search_vector" tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', html_strip_tags("body"))
  ) STORED;

CREATE INDEX "idx_forum_posts_search_vector"
  ON "public"."forum_posts" USING GIN ("search_vector");

-- --------------------------------------------------------------------------
-- 4. Recreate forum_thread_listings view (unchanged definition)
-- --------------------------------------------------------------------------

CREATE VIEW "public"."forum_thread_listings"
WITH (security_invoker = true) AS
SELECT ft.*,
       fp."id" AS "op_post_id",
       fp."body_preview",
       fp."body" AS "op_body",
       fp."body_format" AS "op_body_format",
       fp."like_count" AS "op_like_count",
       fp."search_vector" AS "op_search_vector",
       fto."name" AS "topic_name"
FROM "public"."forum_threads" ft
LEFT JOIN "public"."forum_posts" fp ON fp."thread_id" = ft."id" AND fp."is_op" = true
LEFT JOIN "public"."forum_topics" fto ON fto."slug" = ft."topic";

ALTER VIEW "public"."forum_thread_listings" OWNER TO "postgres";
GRANT SELECT ON "public"."forum_thread_listings" TO "authenticated";
GRANT SELECT ON "public"."forum_thread_listings" TO "service_role";
