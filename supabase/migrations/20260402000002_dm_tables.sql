-- ============================================================================
-- Direct Messaging: dm_conversations + dm_messages + dm_read_receipts
-- One-to-one DMs with RLS, real-time support, and unread tracking
-- ============================================================================

-- --------------------------------------------------------------------------
-- Tables
-- --------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS "public"."dm_conversations" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "user1_id" "uuid",
    "user2_id" "uuid",
    "last_message_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "dm_conversations_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dm_conversations_pair_key" UNIQUE ("user1_id", "user2_id"),
    CONSTRAINT "dm_conversations_ordered_pair" CHECK (
        "user1_id" IS NULL OR "user2_id" IS NULL OR "user1_id" < "user2_id"
    )
);

ALTER TABLE "public"."dm_conversations" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."dm_messages" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "conversation_id" "uuid" NOT NULL,
    "sender_id" "uuid",
    "body" "text" NOT NULL,
    "body_format" "text" NOT NULL DEFAULT 'html',
    "edited_at" timestamp with time zone,
    "deleted_at" timestamp with time zone,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,
    "updated_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "dm_messages_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dm_messages_body_length" CHECK (
        char_length("body") >= 1 AND char_length("body") <= 5000
    ),
    CONSTRAINT "dm_messages_body_format_check" CHECK (
        "body_format" IN ('text', 'html')
    )
);

ALTER TABLE "public"."dm_messages" OWNER TO "postgres";

CREATE TABLE IF NOT EXISTS "public"."dm_read_receipts" (
    "conversation_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "last_read_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "dm_read_receipts_pkey" PRIMARY KEY ("conversation_id", "user_id")
);

ALTER TABLE "public"."dm_read_receipts" OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- Foreign keys
-- --------------------------------------------------------------------------

ALTER TABLE "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user1_fkey"
    FOREIGN KEY ("user1_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE "public"."dm_conversations"
    ADD CONSTRAINT "dm_conversations_user2_fkey"
    FOREIGN KEY ("user2_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;

ALTER TABLE "public"."dm_messages"
    ADD CONSTRAINT "dm_messages_sender_fkey"
    FOREIGN KEY ("sender_id") REFERENCES "public"."profiles"("id") ON DELETE SET NULL;

ALTER TABLE "public"."dm_read_receipts"
    ADD CONSTRAINT "dm_read_receipts_conversation_fkey"
    FOREIGN KEY ("conversation_id") REFERENCES "public"."dm_conversations"("id") ON DELETE CASCADE;

ALTER TABLE "public"."dm_read_receipts"
    ADD CONSTRAINT "dm_read_receipts_user_fkey"
    FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id") ON DELETE CASCADE;

-- --------------------------------------------------------------------------
-- Indexes
-- --------------------------------------------------------------------------

-- Find conversations for a user (user can be user1 or user2)
CREATE INDEX "idx_dm_conversations_user1" ON "public"."dm_conversations" ("user1_id", "last_message_at" DESC);
CREATE INDEX "idx_dm_conversations_user2" ON "public"."dm_conversations" ("user2_id", "last_message_at" DESC);

-- Messages in a conversation, ordered by time
CREATE INDEX "idx_dm_messages_conversation" ON "public"."dm_messages" ("conversation_id", "created_at" DESC, "id" DESC);

-- Sender lookup
CREATE INDEX "idx_dm_messages_sender" ON "public"."dm_messages" ("sender_id");

-- Composite index for unread count queries
CREATE INDEX "idx_dm_messages_unread" ON "public"."dm_messages" ("conversation_id", "sender_id", "deleted_at", "created_at");

-- --------------------------------------------------------------------------
-- Trigger: update last_message_at on new message
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."dm_update_last_message_at"()
    RETURNS "trigger"
    LANGUAGE "plpgsql"
    SECURITY DEFINER
    AS $$
BEGIN
    UPDATE public.dm_conversations
    SET last_message_at = NEW.created_at
    WHERE id = NEW.conversation_id;
    RETURN NULL;
END;
$$;

ALTER FUNCTION "public"."dm_update_last_message_at"() OWNER TO "postgres";

CREATE TRIGGER "dm_messages_update_conversation"
    AFTER INSERT ON "public"."dm_messages"
    FOR EACH ROW
    EXECUTE FUNCTION "public"."dm_update_last_message_at"();

-- --------------------------------------------------------------------------
-- RPC: start or get a conversation (handles ordered pair logic)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."dm_get_or_create_conversation"(
    "_other_user_id" "uuid"
)
    RETURNS "uuid"
    LANGUAGE "plpgsql"
    SECURITY INVOKER
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

-- --------------------------------------------------------------------------
-- RLS
-- --------------------------------------------------------------------------

ALTER TABLE "public"."dm_conversations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dm_messages" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "public"."dm_read_receipts" ENABLE ROW LEVEL SECURITY;

-- dm_conversations: participants only
CREATE POLICY "Users can view own conversations"
    ON "public"."dm_conversations" FOR SELECT
    USING (
        "auth"."uid"() = "user1_id" OR "auth"."uid"() = "user2_id"
    );

CREATE POLICY "Users can insert conversations they participate in"
    ON "public"."dm_conversations" FOR INSERT
    WITH CHECK (
        "auth"."uid"() = "user1_id" OR "auth"."uid"() = "user2_id"
    );

-- No UPDATE policy for authenticated users on dm_conversations.
-- The dm_update_last_message_at trigger is SECURITY DEFINER (runs as postgres),
-- so it bypasses RLS and handles last_message_at updates automatically.

-- dm_messages: participants of the conversation only
CREATE POLICY "Users can read messages in own conversations"
    ON "public"."dm_messages" FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "public"."dm_conversations"
            WHERE "id" = "conversation_id"
            AND ("user1_id" = "auth"."uid"() OR "user2_id" = "auth"."uid"())
        )
    );

CREATE POLICY "Users can send messages in own conversations"
    ON "public"."dm_messages" FOR INSERT
    WITH CHECK (
        "auth"."uid"() = "sender_id"
        AND EXISTS (
            SELECT 1 FROM "public"."dm_conversations"
            WHERE "id" = "conversation_id"
            AND ("user1_id" = "auth"."uid"() OR "user2_id" = "auth"."uid"())
        )
    );

CREATE POLICY "Users can update own messages"
    ON "public"."dm_messages" FOR UPDATE
    USING ("auth"."uid"() = "sender_id")
    WITH CHECK ("auth"."uid"() = "sender_id");

-- dm_read_receipts: own receipts only
CREATE POLICY "Users can view own read receipts"
    ON "public"."dm_read_receipts" FOR SELECT
    USING ("auth"."uid"() = "user_id");

CREATE POLICY "Users can upsert own read receipts"
    ON "public"."dm_read_receipts" FOR INSERT
    WITH CHECK ("auth"."uid"() = "user_id");

CREATE POLICY "Users can update own read receipts"
    ON "public"."dm_read_receipts" FOR UPDATE
    USING ("auth"."uid"() = "user_id")
    WITH CHECK ("auth"."uid"() = "user_id");

-- Also allow participants to see each other's read receipts (for read indicators)
CREATE POLICY "Participants can view conversation read receipts"
    ON "public"."dm_read_receipts" FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "public"."dm_conversations"
            WHERE "id" = "conversation_id"
            AND ("user1_id" = "auth"."uid"() OR "user2_id" = "auth"."uid"())
        )
    );

-- --------------------------------------------------------------------------
-- Grants
-- --------------------------------------------------------------------------

GRANT SELECT, INSERT ON TABLE "public"."dm_conversations" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_conversations" TO "service_role";

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."dm_messages" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_messages" TO "service_role";

GRANT SELECT, INSERT, UPDATE ON TABLE "public"."dm_read_receipts" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_read_receipts" TO "service_role";

-- --------------------------------------------------------------------------
-- RPC: batch unread counts (avoids N+1 queries)
-- --------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION "public"."dm_unread_counts"(
    "_user_id" "uuid"
)
    RETURNS TABLE("conversation_id" "uuid", "unread_count" bigint)
    LANGUAGE "sql"
    STABLE
    SECURITY INVOKER
    AS $$
    SELECT
        m.conversation_id,
        COUNT(*) AS unread_count
    FROM public.dm_messages m
    LEFT JOIN public.dm_read_receipts r
        ON r.conversation_id = m.conversation_id AND r.user_id = _user_id
    WHERE m.conversation_id IN (
        SELECT id FROM public.dm_conversations
        WHERE user1_id = _user_id OR user2_id = _user_id
    )
    AND m.sender_id != _user_id
    AND m.deleted_at IS NULL
    AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    GROUP BY m.conversation_id;
$$;

ALTER FUNCTION "public"."dm_unread_counts"("_user_id" "uuid") OWNER TO "postgres";

-- --------------------------------------------------------------------------
-- Enable Realtime for DM tables
-- --------------------------------------------------------------------------

ALTER PUBLICATION supabase_realtime ADD TABLE "public"."dm_conversations";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."dm_messages";
ALTER PUBLICATION supabase_realtime ADD TABLE "public"."dm_read_receipts";
