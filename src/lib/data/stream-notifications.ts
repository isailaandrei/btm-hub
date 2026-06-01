import { createAdminClient } from "@/lib/supabase/admin";

interface StreamMessageNotificationsInput {
  threadId: string;
  recipientIds: string[];
  actorId: string | null;
  streamMessageId: string;
  streamChannelCid: string;
  streamChannelId: string;
  bodyPreview: string;
}

export async function createStreamMessageNotifications({
  threadId,
  recipientIds,
  actorId,
  streamMessageId,
  streamChannelCid,
  streamChannelId,
  bodyPreview,
}: StreamMessageNotificationsInput): Promise<void> {
  const uniqueRecipientIds = Array.from(new Set(recipientIds));
  if (uniqueRecipientIds.length === 0) return;

  const supabase = await createAdminClient();
  const { error } = await supabase.from("notifications").insert(
    uniqueRecipientIds.map((recipientId) => ({
      recipient_id: recipientId,
      actor_id: actorId,
      type: "stream_message",
      entity_type: "stream_message",
      entity_id: threadId,
      metadata: {
        thread_id: threadId,
        stream_message_id: streamMessageId,
        stream_channel_cid: streamChannelCid,
        stream_channel_id: streamChannelId,
        body_preview: bodyPreview,
      },
    })),
  );

  if (error) {
    if (error.code === "23505") return;
    throw new Error(`Failed to create Stream notification: ${error.message}`);
  }
}

export async function markStreamThreadNotificationsRead({
  recipientId,
  threadId,
}: {
  recipientId: string;
  threadId: string;
}): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("notifications")
    .update({ read_at: new Date().toISOString() })
    .eq("recipient_id", recipientId)
    .eq("type", "stream_message")
    .eq("metadata->>thread_id", threadId)
    .is("read_at", null);

  if (error) {
    throw new Error(`Failed to mark Stream notifications read: ${error.message}`);
  }
}
