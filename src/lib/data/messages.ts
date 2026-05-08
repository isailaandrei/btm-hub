import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import type {
  DmMessageWithSender,
  Profile,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Messages
// ---------------------------------------------------------------------------

const MESSAGES_PAGE_SIZE = 50;

type ParticipantProfile =
  | Pick<Profile, "id" | "display_name" | "avatar_url">
  | Pick<Profile, "id" | "display_name" | "avatar_url">[]
  | null
  | undefined;

function normalizeParticipantProfile(profile: ParticipantProfile) {
  return Array.isArray(profile) ? profile[0] ?? null : profile ?? null;
}

export const getMessages = cache(async function getMessages(
  conversationId: string,
): Promise<DmMessageWithSender[]> {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dm_messages")
    .select("*, profiles!dm_messages_sender_fkey(id, display_name, avatar_url)")
    .eq("conversation_id", conversationId)
    .order("created_at", { ascending: false })
    .order("id", { ascending: false })
    .limit(MESSAGES_PAGE_SIZE);

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);

  return (data ?? []).reverse().map((row) => ({
    id: row.id,
    conversation_id: row.conversation_id,
    sender_id: row.sender_id,
    body: row.body,
    body_format: row.body_format as "text" | "html",
    edited_at: row.edited_at,
    deleted_at: row.deleted_at,
    created_at: row.created_at,
    updated_at: row.updated_at,
    sender: (row.profiles as Pick<Profile, "id" | "display_name" | "avatar_url">) ?? null,
  }));
});

// ---------------------------------------------------------------------------
// Conversation detail (for verifying access)
// ---------------------------------------------------------------------------

export const getConversation = cache(async function getConversation(
  conversationId: string,
) {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  const { data, error } = await supabase
    .from("dm_conversations")
    .select(`
      id,
      user1_id,
      user2_id,
      last_message_at,
      created_at,
      user1:profiles!dm_conversations_user1_fkey(id, display_name, avatar_url),
      user2:profiles!dm_conversations_user2_fkey(id, display_name, avatar_url)
    `)
    .eq("id", conversationId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  // RLS should handle this, but double-check
  if (data.user1_id !== user.id && data.user2_id !== user.id) return null;

  const otherId = data.user1_id === user.id ? data.user2_id : data.user1_id;
  const user1 = normalizeParticipantProfile(data.user1 as ParticipantProfile);
  const user2 = normalizeParticipantProfile(data.user2 as ParticipantProfile);
  const participant = otherId === data.user1_id ? user1 : user2;

  return {
    id: data.id,
    user1_id: data.user1_id,
    user2_id: data.user2_id,
    last_message_at: data.last_message_at,
    created_at: data.created_at,
    participant,
  };
});
