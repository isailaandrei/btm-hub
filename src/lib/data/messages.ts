import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import type {
  DmConversationWithParticipant,
  DmMessageWithSender,
  Profile,
} from "@/types/database";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface UnreadCounts {
  /** Map of conversationId → unread count */
  byConversation: Record<string, number>;
  /** Total unread across all conversations */
  total: number;
}

// ---------------------------------------------------------------------------
// Conversations
// ---------------------------------------------------------------------------

export const getConversations = cache(async function getConversations(): Promise<
  DmConversationWithParticipant[]
> {
  const user = await getAuthUser();
  if (!user) return [];

  const supabase = await createClient();

  // Fetch conversations where user is a participant
  const { data, error } = await supabase
    .from("dm_conversations")
    .select("*")
    .or(`user1_id.eq.${user.id},user2_id.eq.${user.id}`)
    .order("last_message_at", { ascending: false })
    .limit(30);

  if (error) throw new Error(`Failed to fetch conversations: ${error.message}`);

  if (!data || data.length === 0) return [];

  // Get the other participant's profile for each conversation
  const otherUserIds = data.map((c) =>
    c.user1_id === user.id ? c.user2_id : c.user1_id,
  );

  const uniqueIds = [...new Set(otherUserIds)];

  // Fetch profiles and unread counts in parallel (single RPC, no N+1)
  const [{ data: profiles, error: profilesError }, { data: unreadRows, error: unreadError }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("id, display_name, avatar_url")
        .in("id", uniqueIds),
      supabase.rpc("dm_unread_counts", { _user_id: user.id }),
    ]);

  if (profilesError) throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
  if (unreadError) throw new Error(`Failed to fetch unread counts: ${unreadError.message}`);

  const profileMap = new Map(
    (profiles ?? []).map((p) => [p.id, p as Pick<Profile, "id" | "display_name" | "avatar_url">]),
  );

  const unreadMap = new Map(
    (unreadRows ?? []).map((r: { conversation_id: string; unread_count: number }) => [
      r.conversation_id,
      r.unread_count,
    ]),
  );

  return data.map((c) => {
    const otherId = c.user1_id === user.id ? c.user2_id : c.user1_id;
    return {
      ...c,
      participant: profileMap.get(otherId) ?? null,
      unread_count: unreadMap.get(c.id) ?? 0,
    };
  });
});

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
// Unread counts (single RPC call — no N+1)
// ---------------------------------------------------------------------------

export const getUnreadCounts = cache(async function getUnreadCounts(): Promise<UnreadCounts> {
  const user = await getAuthUser();
  if (!user) return { byConversation: {}, total: 0 };

  const supabase = await createClient();

  const { data, error } = await supabase.rpc("dm_unread_counts", {
    _user_id: user.id,
  });

  if (error) throw new Error(`Failed to fetch unread counts: ${error.message}`);

  const byConversation: Record<string, number> = {};
  let total = 0;

  for (const row of data ?? []) {
    byConversation[row.conversation_id] = row.unread_count;
    total += row.unread_count;
  }

  return { byConversation, total };
});
