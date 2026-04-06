


SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;


COMMENT ON SCHEMA "public" IS 'standard public schema';



CREATE EXTENSION IF NOT EXISTS "pg_graphql" WITH SCHEMA "graphql";






CREATE EXTENSION IF NOT EXISTS "pg_stat_statements" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "pgcrypto" WITH SCHEMA "extensions";






CREATE EXTENSION IF NOT EXISTS "supabase_vault" WITH SCHEMA "vault";






CREATE EXTENSION IF NOT EXISTS "uuid-ossp" WITH SCHEMA "extensions";






CREATE OR REPLACE FUNCTION "public"."add_admin_note"("app_id" "uuid", "note_author_id" "uuid", "note_author_name" "text", "note_text" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result applications%ROWTYPE;
BEGIN
  UPDATE applications
  SET
    admin_notes = admin_notes || jsonb_build_array(
      jsonb_build_object(
        'author_id', note_author_id,
        'author_name', note_author_name,
        'text', note_text,
        'created_at', now()
      )
    ),
    updated_at = now()
  WHERE id = app_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found: %', app_id;
  END IF;

  RETURN to_jsonb(result);
END;
$$;


ALTER FUNCTION "public"."add_admin_note"("app_id" "uuid", "note_author_id" "uuid", "note_author_name" "text", "note_text" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."add_application_tag"("app_id" "uuid", "new_tag" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result applications%ROWTYPE;
BEGIN
  IF LENGTH(new_tag) > 50 THEN
    RAISE EXCEPTION 'Tag exceeds 50 characters: %', LEFT(new_tag, 20) || '...';
  END IF;

  UPDATE applications
  SET
    tags = CASE
      WHEN new_tag = ANY(tags) THEN tags
      ELSE array_append(tags, new_tag)
    END,
    updated_at = CASE
      WHEN new_tag = ANY(tags) THEN updated_at
      ELSE now()
    END
  WHERE id = app_id
  RETURNING * INTO result;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Application not found: %', app_id;
  END IF;

  RETURN to_jsonb(result);
END;
$$;


ALTER FUNCTION "public"."add_application_tag"("app_id" "uuid", "new_tag" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_get_or_create_conversation"("_other_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
    _current_user_id uuid := auth.uid();
    _u1 uuid;
    _u2 uuid;
    _conv_id uuid;
BEGIN
    IF _current_user_id IS NULL THEN
        RAISE EXCEPTION 'Not authenticated';
    END IF;

    IF _current_user_id = _other_user_id THEN
        RAISE EXCEPTION 'Cannot message yourself';
    END IF;

    -- Order the pair
    IF _current_user_id < _other_user_id THEN
        _u1 := _current_user_id;
        _u2 := _other_user_id;
    ELSE
        _u1 := _other_user_id;
        _u2 := _current_user_id;
    END IF;

    -- Try to find existing
    SELECT id INTO _conv_id
    FROM public.dm_conversations
    WHERE user1_id = _u1 AND user2_id = _u2;

    IF _conv_id IS NOT NULL THEN
        RETURN _conv_id;
    END IF;

    -- Create new
    INSERT INTO public.dm_conversations (user1_id, user2_id)
    VALUES (_u1, _u2)
    ON CONFLICT (user1_id, user2_id) DO UPDATE SET user1_id = EXCLUDED.user1_id
    RETURNING id INTO _conv_id;

    RETURN _conv_id;
END;
$$;


ALTER FUNCTION "public"."dm_get_or_create_conversation"("_other_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_unread_counts"("_user_id" "uuid") RETURNS TABLE("conversation_id" "uuid", "unread_count" bigint)
    LANGUAGE "sql" STABLE
    AS $$
    SELECT
        m.conversation_id,
        COUNT(*) AS unread_count
    FROM public.dm_messages m
    LEFT JOIN public.dm_read_receipts r
        ON r.conversation_id = m.conversation_id AND r.user_id = _user_id
    WHERE _user_id = auth.uid()
    AND m.conversation_id IN (
        SELECT id FROM public.dm_conversations
        WHERE user1_id = _user_id OR user2_id = _user_id
    )
    AND m.sender_id != _user_id
    AND m.deleted_at IS NULL
    AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    GROUP BY m.conversation_id;
$$;


ALTER FUNCTION "public"."dm_unread_counts"("_user_id" "uuid") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."dm_update_last_message_at"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.dm_conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NULL;
END;
$$;


ALTER FUNCTION "public"."dm_update_last_message_at"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forum_restrict_post_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."forum_restrict_post_update"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."forum_restrict_thread_update"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION "public"."forum_update_post_like_count"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


CREATE OR REPLACE FUNCTION "public"."forum_update_thread_reply_stats"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
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


ALTER FUNCTION "public"."forum_update_thread_reply_stats"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_shared_application"("share_token" "text") RETURNS TABLE("application_id" "uuid", "program" "text", "status" "text", "answers" "jsonb", "files" "jsonb", "submitted_at" timestamp with time zone, "expires_at" timestamp with time zone)
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.id AS application_id, a.program, a.status,
    a.answers, a.files, a.submitted_at, s.expires_at
  FROM public.application_shares s
  JOIN public.applications a ON a.id = s.application_id
  WHERE s.token = share_token
    AND (s.expires_at IS NULL OR s.expires_at > now());
END;
$$;


ALTER FUNCTION "public"."get_shared_application"("share_token" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."get_top_replies_by_threads"("_thread_ids" "uuid"[], "_limit_per_thread" integer DEFAULT 2) RETURNS TABLE("id" "uuid", "thread_id" "uuid", "author_id" "uuid", "body" "text", "body_format" "text", "body_preview" "text", "like_count" integer, "created_at" timestamp with time zone, "updated_at" timestamp with time zone, "author_display_name" "text", "author_avatar_url" "text")
    LANGUAGE "sql" STABLE
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


ALTER FUNCTION "public"."get_top_replies_by_threads"("_thread_ids" "uuid"[], "_limit_per_thread" integer) OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."handle_new_user"() RETURNS "trigger"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
BEGIN
  INSERT INTO public.profiles (id, email, display_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'display_name', split_part(NEW.email, '@', 1))
  );
  RETURN NEW;
END;
$$;


ALTER FUNCTION "public"."handle_new_user"() OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."html_strip_tags"("input" "text") RETURNS "text"
    LANGUAGE "sql" IMMUTABLE
    AS $$
    SELECT regexp_replace(input, '<[^>]*>', '', 'g');
$$;


ALTER FUNCTION "public"."html_strip_tags"("input" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."remove_application_tag"("app_id" "uuid", "old_tag" "text") RETURNS "jsonb"
    LANGUAGE "plpgsql"
    AS $$
DECLARE
  result applications%ROWTYPE;
BEGIN
  UPDATE applications
  SET
    tags = array_remove(tags, old_tag),
    updated_at = now()
  WHERE id = app_id
    AND old_tag = ANY(tags)
  RETURNING * INTO result;

  IF NOT FOUND THEN
    -- Could be missing application or tag not present; check which
    IF NOT EXISTS (SELECT 1 FROM applications WHERE id = app_id) THEN
      RAISE EXCEPTION 'Application not found: %', app_id;
    END IF;
    -- Tag wasn't present — return current row unchanged
    SELECT * INTO result FROM applications WHERE id = app_id;
  END IF;

  RETURN to_jsonb(result);
END;
$$;


ALTER FUNCTION "public"."remove_application_tag"("app_id" "uuid", "old_tag" "text") OWNER TO "postgres";


CREATE OR REPLACE FUNCTION "public"."toggle_thread_lock"("_thread_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
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


CREATE OR REPLACE FUNCTION "public"."toggle_thread_pin"("_thread_id" "uuid") RETURNS "void"
    LANGUAGE "plpgsql"
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

SET default_tablespace = '';

SET default_table_access_method = "heap";


CREATE TABLE IF NOT EXISTS "public"."application_shares" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "application_id" "uuid" NOT NULL,
    "token" "text" DEFAULT "encode"("extensions"."gen_random_bytes"(32), 'hex'::"text") NOT NULL,
    "created_by" "uuid" NOT NULL,
    "expires_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."application_shares" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."applications" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user_id" "uuid",
    "program" "text" NOT NULL,
    "status" "text" DEFAULT 'new'::"text" NOT NULL,
    "answers" "jsonb" NOT NULL,
    "files" "jsonb" DEFAULT '[]'::"jsonb",
    "tags" "text"[] DEFAULT '{}'::"text"[],
    "admin_notes" "jsonb" DEFAULT '[]'::"jsonb",
    "submitted_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "search_vector" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", ((((((((((((((((((((COALESCE(("answers" ->> 'first_name'::"text"), ''::"text") || ' '::"text") || COALESCE(("answers" ->> 'last_name'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'email'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'nationality'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'country_of_residence'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'current_occupation'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'photography_equipment'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'ultimate_vision'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'inspiration_to_apply'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'questions_or_concerns'::"text"), ''::"text")) || ' '::"text") || COALESCE(("answers" ->> 'anything_else'::"text"), ''::"text")))) STORED,
    CONSTRAINT "applications_status_check" CHECK (("status" = ANY (ARRAY['reviewing'::"text", 'accepted'::"text", 'rejected'::"text"])))
);


ALTER TABLE "public"."applications" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user1_id" "uuid",
    "user2_id" "uuid",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dm_conversations_ordered_pair" CHECK ((("user1_id" IS NULL) OR ("user2_id" IS NULL) OR ("user1_id" < "user2_id")))
);


ALTER TABLE "public"."dm_conversations" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_message_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dm_message_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "body" "text" NOT NULL,
    "body_format" "text" DEFAULT 'html'::"text" NOT NULL,
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    CONSTRAINT "dm_messages_body_format_check" CHECK (("body_format" = ANY (ARRAY['text'::"text", 'html'::"text"]))),
    CONSTRAINT "dm_messages_body_length" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 5000)))
);


ALTER TABLE "public"."dm_messages" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."dm_read_receipts" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."dm_read_receipts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "post_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forum_likes" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_posts" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "thread_id" "uuid" NOT NULL,
    "author_id" "uuid",
    "body" "text" NOT NULL,
    "is_op" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "body_format" "text" DEFAULT 'markdown'::"text" NOT NULL,
    "body_preview" "text" GENERATED ALWAYS AS (
CASE
    WHEN ("body_format" = 'html'::"text") THEN "left"("regexp_replace"("body", '<[^>]*>'::"text", ''::"text", 'g'::"text"), 200)
    ELSE "left"("body", 200)
END) STORED,
    "like_count" integer DEFAULT 0 NOT NULL,
    "search_vector" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "public"."html_strip_tags"("body"))) STORED,
    CONSTRAINT "forum_posts_body_format_check" CHECK (("body_format" = ANY (ARRAY['markdown'::"text", 'html'::"text"]))),
    CONSTRAINT "forum_posts_body_length" CHECK ((("char_length"("body") >= 1) AND ("char_length"("body") <= 20000)))
);


ALTER TABLE "public"."forum_posts" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_threads" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "author_id" "uuid",
    "topic" "text",
    "title" "text" NOT NULL,
    "slug" "text" NOT NULL,
    "reply_count" integer DEFAULT 0 NOT NULL,
    "pinned" boolean DEFAULT false NOT NULL,
    "locked" boolean DEFAULT false NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "last_reply_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "title_search" "tsvector" GENERATED ALWAYS AS ("to_tsvector"('"english"'::"regconfig", "title")) STORED,
    CONSTRAINT "forum_threads_slug_format" CHECK ((("slug" ~ '^[a-z0-9][a-z0-9-]*[a-z0-9]$'::"text") AND ("char_length"("slug") <= 86))),
    CONSTRAINT "forum_threads_title_length" CHECK ((("char_length"("title") >= 3) AND ("char_length"("title") <= 200)))
);


ALTER TABLE "public"."forum_threads" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."forum_topics" (
    "slug" "text" NOT NULL,
    "name" "text" NOT NULL,
    "description" "text" DEFAULT ''::"text" NOT NULL,
    "icon" "text" DEFAULT ''::"text" NOT NULL,
    "sort_order" integer DEFAULT 0 NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL
);


ALTER TABLE "public"."forum_topics" OWNER TO "postgres";


CREATE OR REPLACE VIEW "public"."forum_thread_listings" WITH ("security_invoker"='true') AS
 SELECT "ft"."id",
    "ft"."author_id",
    "ft"."topic",
    "ft"."title",
    "ft"."slug",
    "ft"."reply_count",
    "ft"."pinned",
    "ft"."locked",
    "ft"."created_at",
    "ft"."updated_at",
    "ft"."last_reply_at",
    "ft"."title_search",
    "fp"."id" AS "op_post_id",
    "fp"."body_preview",
    "fp"."body" AS "op_body",
    "fp"."body_format" AS "op_body_format",
    "fp"."like_count" AS "op_like_count",
    "fp"."search_vector" AS "op_search_vector",
    "fto"."name" AS "topic_name"
   FROM (("public"."forum_threads" "ft"
     LEFT JOIN "public"."forum_posts" "fp" ON ((("fp"."thread_id" = "ft"."id") AND ("fp"."is_op" = true))))
     LEFT JOIN "public"."forum_topics" "fto" ON (("fto"."slug" = "ft"."topic")));


ALTER VIEW "public"."forum_thread_listings" OWNER TO "postgres";


CREATE TABLE IF NOT EXISTS "public"."profiles" (
    "id" "uuid" NOT NULL,
    "email" "text" NOT NULL,
    "display_name" "text",
    "bio" "text",
    "avatar_url" "text",
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "role" "text" DEFAULT 'member'::"text" NOT NULL,
    CONSTRAINT "profiles_bio_check" CHECK (("char_length"("bio") <= 500))
);


ALTER TABLE "public"."profiles" OWNER TO "postgres";


ALTER TABLE ONLY "public"."application_shares"
    ADD CONSTRAINT "application_shares_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."application_shares"
    ADD CONSTRAINT "application_shares_token_key" UNIQUE ("token");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_pair_key" UNIQUE ("user1_id", "user2_id");



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_message_likes"
    ADD CONSTRAINT "dm_message_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_message_likes"
    ADD CONSTRAINT "dm_message_likes_unique" UNIQUE ("message_id", "user_id");



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."dm_read_receipts"
    ADD CONSTRAINT "dm_read_receipts_pkey" PRIMARY KEY ("conversation_id", "user_id");



ALTER TABLE ONLY "public"."forum_likes"
    ADD CONSTRAINT "forum_likes_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_likes"
    ADD CONSTRAINT "forum_likes_unique" UNIQUE ("post_id", "user_id");



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_pkey" PRIMARY KEY ("id");



ALTER TABLE ONLY "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_slug_unique" UNIQUE ("slug");



ALTER TABLE ONLY "public"."forum_topics"
    ADD CONSTRAINT "forum_topics_pkey" PRIMARY KEY ("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_pkey" PRIMARY KEY ("id");



CREATE INDEX "idx_application_shares_token" ON "public"."application_shares" USING "btree" ("token");



CREATE INDEX "idx_applications_answers" ON "public"."applications" USING "gin" ("answers" "jsonb_path_ops");



CREATE INDEX "idx_applications_program" ON "public"."applications" USING "btree" ("program");



CREATE INDEX "idx_applications_search" ON "public"."applications" USING "gin" ("search_vector");



CREATE INDEX "idx_applications_status" ON "public"."applications" USING "btree" ("status");



CREATE INDEX "idx_applications_submitted_at" ON "public"."applications" USING "btree" ("submitted_at" DESC);



CREATE INDEX "idx_applications_tags" ON "public"."applications" USING "gin" ("tags");



CREATE INDEX "idx_dm_conversations_user1" ON "public"."dm_conversations" USING "btree" ("user1_id", "last_message_at" DESC);



CREATE INDEX "idx_dm_conversations_user2" ON "public"."dm_conversations" USING "btree" ("user2_id", "last_message_at" DESC);



CREATE INDEX "idx_dm_message_likes_message" ON "public"."dm_message_likes" USING "btree" ("message_id");



CREATE INDEX "idx_dm_messages_conversation" ON "public"."dm_messages" USING "btree" ("conversation_id", "created_at" DESC, "id" DESC);



CREATE INDEX "idx_dm_messages_sender" ON "public"."dm_messages" USING "btree" ("sender_id");



CREATE INDEX "idx_dm_messages_unread" ON "public"."dm_messages" USING "btree" ("conversation_id", "sender_id", "deleted_at", "created_at");



CREATE INDEX "idx_forum_likes_post" ON "public"."forum_likes" USING "btree" ("post_id");



CREATE INDEX "idx_forum_likes_user" ON "public"."forum_likes" USING "btree" ("user_id");



CREATE INDEX "idx_forum_posts_author" ON "public"."forum_posts" USING "btree" ("author_id");



CREATE INDEX "idx_forum_posts_search_vector" ON "public"."forum_posts" USING "gin" ("search_vector");



CREATE INDEX "idx_forum_posts_thread_listing" ON "public"."forum_posts" USING "btree" ("thread_id", "created_at", "id");



CREATE UNIQUE INDEX "idx_forum_posts_thread_op" ON "public"."forum_posts" USING "btree" ("thread_id") WHERE ("is_op" = true);



CREATE INDEX "idx_forum_threads_author" ON "public"."forum_threads" USING "btree" ("author_id");



CREATE INDEX "idx_forum_threads_recent" ON "public"."forum_threads" USING "btree" ("last_reply_at" DESC, "id" DESC);



CREATE INDEX "idx_forum_threads_title_search" ON "public"."forum_threads" USING "gin" ("title_search");



CREATE INDEX "idx_forum_threads_topic_listing" ON "public"."forum_threads" USING "btree" ("topic", "pinned" DESC, "last_reply_at" DESC, "id" DESC);



CREATE OR REPLACE TRIGGER "dm_messages_update_conversation" AFTER INSERT ON "public"."dm_messages" FOR EACH ROW EXECUTE FUNCTION "public"."dm_update_last_message_at"();



CREATE OR REPLACE TRIGGER "forum_likes_count" AFTER INSERT OR DELETE ON "public"."forum_likes" FOR EACH ROW EXECUTE FUNCTION "public"."forum_update_post_like_count"();



CREATE OR REPLACE TRIGGER "forum_posts_reply_stats" AFTER INSERT OR DELETE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "public"."forum_update_thread_reply_stats"();



CREATE OR REPLACE TRIGGER "forum_posts_restrict_update" BEFORE UPDATE ON "public"."forum_posts" FOR EACH ROW EXECUTE FUNCTION "public"."forum_restrict_post_update"();



CREATE OR REPLACE TRIGGER "forum_threads_restrict_update" BEFORE UPDATE ON "public"."forum_threads" FOR EACH ROW EXECUTE FUNCTION "public"."forum_restrict_thread_update"();



ALTER TABLE ONLY "public"."application_shares"
    ADD CONSTRAINT "application_shares_application_id_fkey" FOREIGN KEY ("application_id") REFERENCES "public"."applications"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."application_shares"
    ADD CONSTRAINT "application_shares_created_by_fkey" FOREIGN KEY ("created_by") REFERENCES "auth"."users"("id");



ALTER TABLE ONLY "public"."applications"
    ADD CONSTRAINT "applications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "auth"."users"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user1_fkey" FOREIGN KEY ("user1_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user2_fkey" FOREIGN KEY ("user2_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dm_message_likes"
    ADD CONSTRAINT "dm_message_likes_message_fkey" FOREIGN KEY ("message_id") REFERENCES "public"."dm_messages"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_message_likes"
    ADD CONSTRAINT "dm_message_likes_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_sender_fkey" FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."dm_read_receipts"
    ADD CONSTRAINT "dm_read_receipts_conversation_fkey" FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."dm_read_receipts"
    ADD CONSTRAINT "dm_read_receipts_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_likes"
    ADD CONSTRAINT "forum_likes_post_fkey" FOREIGN KEY ("post_id") REFERENCES "public"."forum_posts"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_likes"
    ADD CONSTRAINT "forum_likes_user_fkey" FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_author_profile_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forum_posts"
    ADD CONSTRAINT "forum_posts_thread_fkey" FOREIGN KEY ("thread_id") REFERENCES "public"."forum_threads"("id") ON DELETE CASCADE;



ALTER TABLE ONLY "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_author_profile_fkey" FOREIGN KEY ("author_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;



ALTER TABLE ONLY "public"."forum_threads"
    ADD CONSTRAINT "forum_threads_topic_fkey" FOREIGN KEY ("topic") REFERENCES "public"."forum_topics"("slug");



ALTER TABLE ONLY "public"."profiles"
    ADD CONSTRAINT "profiles_id_fkey" FOREIGN KEY ("id") REFERENCES "auth"."users"("id") ON DELETE CASCADE;



CREATE POLICY "Admins can create share links" ON "public"."application_shares" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can create topics" ON "public"."forum_topics" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete any post" ON "public"."forum_posts" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete any thread" ON "public"."forum_threads" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can delete topics" ON "public"."forum_topics" FOR DELETE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read all applications" ON "public"."applications" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can read share links" ON "public"."application_shares" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can reply to any thread" ON "public"."forum_posts" FOR INSERT WITH CHECK ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update any post" ON "public"."forum_posts" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update any thread" ON "public"."forum_threads" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update applications" ON "public"."applications" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Admins can update topics" ON "public"."forum_topics" FOR UPDATE USING ((EXISTS ( SELECT 1
   FROM "public"."profiles"
  WHERE (("profiles"."id" = "auth"."uid"()) AND ("profiles"."role" = 'admin'::"text")))));



CREATE POLICY "Allow public read own applications" ON "public"."applications" FOR SELECT USING (true);



CREATE POLICY "Anyone can submit an application" ON "public"."applications" FOR INSERT WITH CHECK (true);



CREATE POLICY "Authenticated users can create threads" ON "public"."forum_threads" FOR INSERT WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "Authenticated users can read likes" ON "public"."forum_likes" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can read posts" ON "public"."forum_posts" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can read threads" ON "public"."forum_threads" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can read topics" ON "public"."forum_topics" FOR SELECT USING (("auth"."uid"() IS NOT NULL));



CREATE POLICY "Authenticated users can reply to unlocked threads" ON "public"."forum_posts" FOR INSERT WITH CHECK ((("auth"."uid"() = "author_id") AND (NOT (EXISTS ( SELECT 1
   FROM "public"."forum_threads"
  WHERE (("forum_threads"."id" = "forum_posts"."thread_id") AND ("forum_threads"."locked" = true)))))));



CREATE POLICY "Participants can view conversation read receipts" ON "public"."dm_read_receipts" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."dm_conversations"
  WHERE (("dm_conversations"."id" = "dm_read_receipts"."conversation_id") AND (("dm_conversations"."user1_id" = "auth"."uid"()) OR ("dm_conversations"."user2_id" = "auth"."uid"()))))));



CREATE POLICY "Profiles are viewable by everyone" ON "public"."profiles" FOR SELECT USING (true);



CREATE POLICY "Users can delete own posts" ON "public"."forum_posts" FOR DELETE USING (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can delete own threads" ON "public"."forum_threads" FOR DELETE USING (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can insert conversations they participate in" ON "public"."dm_conversations" FOR INSERT WITH CHECK ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



CREATE POLICY "Users can insert own profile" ON "public"."profiles" FOR INSERT WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can like messages in own conversations" ON "public"."dm_message_likes" FOR INSERT WITH CHECK ((("auth"."uid"() = "user_id") AND (EXISTS ( SELECT 1
   FROM ("public"."dm_messages" "m"
     JOIN "public"."dm_conversations" "c" ON (("c"."id" = "m"."conversation_id")))
  WHERE (("m"."id" = "dm_message_likes"."message_id") AND (("c"."user1_id" = "auth"."uid"()) OR ("c"."user2_id" = "auth"."uid"())))))));



CREATE POLICY "Users can like posts" ON "public"."forum_likes" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can read messages in own conversations" ON "public"."dm_messages" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM "public"."dm_conversations"
  WHERE (("dm_conversations"."id" = "dm_messages"."conversation_id") AND (("dm_conversations"."user1_id" = "auth"."uid"()) OR ("dm_conversations"."user2_id" = "auth"."uid"()))))));



CREATE POLICY "Users can read own applications" ON "public"."applications" FOR SELECT USING (("user_id" = "auth"."uid"()));



CREATE POLICY "Users can send messages in own conversations" ON "public"."dm_messages" FOR INSERT WITH CHECK ((("auth"."uid"() = "sender_id") AND (EXISTS ( SELECT 1
   FROM "public"."dm_conversations"
  WHERE (("dm_conversations"."id" = "dm_messages"."conversation_id") AND (("dm_conversations"."user1_id" = "auth"."uid"()) OR ("dm_conversations"."user2_id" = "auth"."uid"())))))));



CREATE POLICY "Users can unlike own likes" ON "public"."dm_message_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can unlike own likes" ON "public"."forum_likes" FOR DELETE USING (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own messages" ON "public"."dm_messages" FOR UPDATE USING (("auth"."uid"() = "sender_id")) WITH CHECK (("auth"."uid"() = "sender_id"));



CREATE POLICY "Users can update own posts" ON "public"."forum_posts" FOR UPDATE USING (("auth"."uid"() = "author_id")) WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can update own profile" ON "public"."profiles" FOR UPDATE USING (("auth"."uid"() = "id")) WITH CHECK (("auth"."uid"() = "id"));



CREATE POLICY "Users can update own read receipts" ON "public"."dm_read_receipts" FOR UPDATE USING (("auth"."uid"() = "user_id")) WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can update own threads" ON "public"."forum_threads" FOR UPDATE USING (("auth"."uid"() = "author_id")) WITH CHECK (("auth"."uid"() = "author_id"));



CREATE POLICY "Users can upsert own read receipts" ON "public"."dm_read_receipts" FOR INSERT WITH CHECK (("auth"."uid"() = "user_id"));



CREATE POLICY "Users can view likes in own conversations" ON "public"."dm_message_likes" FOR SELECT USING ((EXISTS ( SELECT 1
   FROM ("public"."dm_messages" "m"
     JOIN "public"."dm_conversations" "c" ON (("c"."id" = "m"."conversation_id")))
  WHERE (("m"."id" = "dm_message_likes"."message_id") AND (("c"."user1_id" = "auth"."uid"()) OR ("c"."user2_id" = "auth"."uid"()))))));



CREATE POLICY "Users can view own conversations" ON "public"."dm_conversations" FOR SELECT USING ((("auth"."uid"() = "user1_id") OR ("auth"."uid"() = "user2_id")));



CREATE POLICY "Users can view own read receipts" ON "public"."dm_read_receipts" FOR SELECT USING (("auth"."uid"() = "user_id"));



ALTER TABLE "public"."application_shares" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."applications" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_conversations" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_message_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_messages" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."dm_read_receipts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_likes" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_posts" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_threads" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."forum_topics" ENABLE ROW LEVEL SECURITY;


ALTER TABLE "public"."profiles" ENABLE ROW LEVEL SECURITY;




ALTER PUBLICATION "supabase_realtime" OWNER TO "postgres";






ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."applications";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dm_conversations";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dm_message_likes";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dm_messages";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."dm_read_receipts";



ALTER PUBLICATION "supabase_realtime" ADD TABLE ONLY "public"."profiles";



GRANT USAGE ON SCHEMA "public" TO "postgres";
GRANT USAGE ON SCHEMA "public" TO "anon";
GRANT USAGE ON SCHEMA "public" TO "authenticated";
GRANT USAGE ON SCHEMA "public" TO "service_role";

























































































































































GRANT ALL ON FUNCTION "public"."add_admin_note"("app_id" "uuid", "note_author_id" "uuid", "note_author_name" "text", "note_text" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_admin_note"("app_id" "uuid", "note_author_id" "uuid", "note_author_name" "text", "note_text" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_admin_note"("app_id" "uuid", "note_author_id" "uuid", "note_author_name" "text", "note_text" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."add_application_tag"("app_id" "uuid", "new_tag" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."add_application_tag"("app_id" "uuid", "new_tag" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."add_application_tag"("app_id" "uuid", "new_tag" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."dm_get_or_create_conversation"("_other_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dm_get_or_create_conversation"("_other_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dm_get_or_create_conversation"("_other_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dm_unread_counts"("_user_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."dm_unread_counts"("_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."dm_unread_counts"("_user_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."dm_update_last_message_at"() TO "anon";
GRANT ALL ON FUNCTION "public"."dm_update_last_message_at"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."dm_update_last_message_at"() TO "service_role";



GRANT ALL ON FUNCTION "public"."forum_restrict_post_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."forum_restrict_post_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forum_restrict_post_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."forum_restrict_thread_update"() TO "anon";
GRANT ALL ON FUNCTION "public"."forum_restrict_thread_update"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forum_restrict_thread_update"() TO "service_role";



GRANT ALL ON FUNCTION "public"."forum_update_post_like_count"() TO "anon";
GRANT ALL ON FUNCTION "public"."forum_update_post_like_count"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forum_update_post_like_count"() TO "service_role";



GRANT ALL ON FUNCTION "public"."forum_update_thread_reply_stats"() TO "anon";
GRANT ALL ON FUNCTION "public"."forum_update_thread_reply_stats"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."forum_update_thread_reply_stats"() TO "service_role";



GRANT ALL ON FUNCTION "public"."get_shared_application"("share_token" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."get_shared_application"("share_token" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_shared_application"("share_token" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."get_top_replies_by_threads"("_thread_ids" "uuid"[], "_limit_per_thread" integer) TO "anon";
GRANT ALL ON FUNCTION "public"."get_top_replies_by_threads"("_thread_ids" "uuid"[], "_limit_per_thread" integer) TO "authenticated";
GRANT ALL ON FUNCTION "public"."get_top_replies_by_threads"("_thread_ids" "uuid"[], "_limit_per_thread" integer) TO "service_role";



GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "anon";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "authenticated";
GRANT ALL ON FUNCTION "public"."handle_new_user"() TO "service_role";



GRANT ALL ON FUNCTION "public"."html_strip_tags"("input" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."html_strip_tags"("input" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."html_strip_tags"("input" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."remove_application_tag"("app_id" "uuid", "old_tag" "text") TO "anon";
GRANT ALL ON FUNCTION "public"."remove_application_tag"("app_id" "uuid", "old_tag" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."remove_application_tag"("app_id" "uuid", "old_tag" "text") TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_thread_lock"("_thread_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_thread_lock"("_thread_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_thread_lock"("_thread_id" "uuid") TO "service_role";



GRANT ALL ON FUNCTION "public"."toggle_thread_pin"("_thread_id" "uuid") TO "anon";
GRANT ALL ON FUNCTION "public"."toggle_thread_pin"("_thread_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."toggle_thread_pin"("_thread_id" "uuid") TO "service_role";


















GRANT ALL ON TABLE "public"."application_shares" TO "anon";
GRANT ALL ON TABLE "public"."application_shares" TO "authenticated";
GRANT ALL ON TABLE "public"."application_shares" TO "service_role";



GRANT ALL ON TABLE "public"."applications" TO "anon";
GRANT ALL ON TABLE "public"."applications" TO "authenticated";
GRANT ALL ON TABLE "public"."applications" TO "service_role";



GRANT ALL ON TABLE "public"."dm_conversations" TO "anon";
GRANT ALL ON TABLE "public"."dm_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_conversations" TO "service_role";



GRANT ALL ON TABLE "public"."dm_message_likes" TO "anon";
GRANT ALL ON TABLE "public"."dm_message_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_message_likes" TO "service_role";



GRANT ALL ON TABLE "public"."dm_messages" TO "anon";
GRANT ALL ON TABLE "public"."dm_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_messages" TO "service_role";



GRANT ALL ON TABLE "public"."dm_read_receipts" TO "anon";
GRANT ALL ON TABLE "public"."dm_read_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_read_receipts" TO "service_role";



GRANT ALL ON TABLE "public"."forum_likes" TO "anon";
GRANT ALL ON TABLE "public"."forum_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_likes" TO "service_role";



GRANT ALL ON TABLE "public"."forum_posts" TO "anon";
GRANT ALL ON TABLE "public"."forum_posts" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_posts" TO "service_role";



GRANT ALL ON TABLE "public"."forum_threads" TO "anon";
GRANT ALL ON TABLE "public"."forum_threads" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_threads" TO "service_role";



GRANT ALL ON TABLE "public"."forum_topics" TO "anon";
GRANT ALL ON TABLE "public"."forum_topics" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_topics" TO "service_role";



GRANT ALL ON TABLE "public"."forum_thread_listings" TO "anon";
GRANT ALL ON TABLE "public"."forum_thread_listings" TO "authenticated";
GRANT ALL ON TABLE "public"."forum_thread_listings" TO "service_role";



GRANT ALL ON TABLE "public"."profiles" TO "anon";
GRANT ALL ON TABLE "public"."profiles" TO "authenticated";
GRANT ALL ON TABLE "public"."profiles" TO "service_role";









ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON SEQUENCES TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON FUNCTIONS TO "service_role";






ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "postgres";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "anon";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "authenticated";
ALTER DEFAULT PRIVILEGES FOR ROLE "postgres" IN SCHEMA "public" GRANT ALL ON TABLES TO "service_role";































