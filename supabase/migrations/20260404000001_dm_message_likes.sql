-- DM message likes (heart reactions)
CREATE TABLE IF NOT EXISTS "public"."dm_message_likes" (
    "id" "uuid" DEFAULT "gen_random_uuid"() NOT NULL,
    "message_id" "uuid" NOT NULL,
    "user_id" "uuid" NOT NULL,
    "created_at" timestamp with time zone DEFAULT "now"() NOT NULL,

    CONSTRAINT "dm_message_likes_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dm_message_likes_unique" UNIQUE ("message_id", "user_id"),
    CONSTRAINT "dm_message_likes_message_fkey"
      FOREIGN KEY ("message_id") REFERENCES "public"."dm_messages"("id")
      ON DELETE CASCADE,
    CONSTRAINT "dm_message_likes_user_fkey"
      FOREIGN KEY ("user_id") REFERENCES "public"."profiles"("id")
      ON DELETE CASCADE
);

ALTER TABLE "public"."dm_message_likes" OWNER TO "postgres";

CREATE INDEX "idx_dm_message_likes_message" ON "public"."dm_message_likes" ("message_id");

-- RLS: participants of the conversation can like/unlike messages
ALTER TABLE "public"."dm_message_likes" ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view likes in own conversations"
    ON "public"."dm_message_likes" FOR SELECT
    USING (
        EXISTS (
            SELECT 1 FROM "public"."dm_messages" m
            JOIN "public"."dm_conversations" c ON c.id = m.conversation_id
            WHERE m.id = "message_id"
            AND (c.user1_id = "auth"."uid"() OR c.user2_id = "auth"."uid"())
        )
    );

CREATE POLICY "Users can like messages in own conversations"
    ON "public"."dm_message_likes" FOR INSERT
    WITH CHECK (
        "auth"."uid"() = "user_id"
        AND EXISTS (
            SELECT 1 FROM "public"."dm_messages" m
            JOIN "public"."dm_conversations" c ON c.id = m.conversation_id
            WHERE m.id = "message_id"
            AND (c.user1_id = "auth"."uid"() OR c.user2_id = "auth"."uid"())
        )
    );

CREATE POLICY "Users can unlike own likes"
    ON "public"."dm_message_likes" FOR DELETE
    USING ("auth"."uid"() = "user_id");

GRANT SELECT, INSERT, DELETE ON TABLE "public"."dm_message_likes" TO "authenticated";
GRANT ALL ON TABLE "public"."dm_message_likes" TO "service_role";

ALTER PUBLICATION supabase_realtime ADD TABLE "public"."dm_message_likes";
