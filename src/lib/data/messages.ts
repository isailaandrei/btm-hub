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
    .order("created_at", { ascending: true })
    .order("id", { ascending: true })
    .limit(MESSAGES_PAGE_SIZE);

  if (error) throw new Error(`Failed to fetch messages: ${error.message}`);

  return (data ?? []).map((row) => ({
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
    .select("*")
    .eq("id", conversationId)
    .single();

  if (error) {
    if (error.code === "PGRST116") return null;
    throw new Error(`Failed to fetch conversation: ${error.message}`);
  }

  // RLS should handle this, but double-check
  if (data.user1_id !== user.id && data.user2_id !== user.id) return null;

  // Get other participant's profile
  const otherId = data.user1_id === user.id ? data.user2_id : data.user1_id;

  const { data: profile } = await supabase
    .from("profiles")
    .select("id, display_name, avatar_url")
    .eq("id", otherId)
    .single();

  return {
    ...data,
    participant: profile as Pick<Profile, "id" | "display_name" | "avatar_url"> | null,
  };
});

// ---------------------------------------------------------------------------
// Recipient's last read timestamp (for "Seen" receipt)
// ---------------------------------------------------------------------------

export const getRecipientLastReadAt = cache(async function getRecipientLastReadAt(
  conversationId: string,
): Promise<string | null> {
  const user = await getAuthUser();
  if (!user) return null;

  const supabase = await createClient();

  // Fetch the conversation to find the other user's ID
  const { data: conversation, error: convError } = await supabase
    .from("dm_conversations")
    .select("user1_id, user2_id")
    .eq("id", conversationId)
    .single();

  if (convError || !conversation) return null;

  const recipientId =
    conversation.user1_id === user.id ? conversation.user2_id : conversation.user1_id;

  const { data, error } = await supabase
    .from("dm_read_receipts")
    .select("last_read_at")
    .eq("conversation_id", conversationId)
    .eq("user_id", recipientId)
    .single();

  if (error) return null;

  return data?.last_read_at ?? null;
});

