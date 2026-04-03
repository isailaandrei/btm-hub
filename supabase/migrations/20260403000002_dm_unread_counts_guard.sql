-- Add auth guard to dm_unread_counts: only allow querying own unread counts
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
