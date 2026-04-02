"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getAuthUser } from "@/lib/data/auth";
import { validateUUID } from "@/lib/validation-helpers";
import { sanitizeBody } from "@/lib/community/sanitize";
import {
  sendMessageSchema,
  editMessageSchema,
  startConversationSchema,
} from "@/lib/validations/messages";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type DmActionState = {
  errors: Record<string, string> | null;
  message: string;
  success: boolean;
  resetKey: number;
};

// ---------------------------------------------------------------------------
// Send message (useActionState pattern)
// ---------------------------------------------------------------------------

export async function sendMessage(
  prevState: DmActionState,
  formData: FormData,
): Promise<DmActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { errors: null, message: "You must be logged in to send messages.", success: false, resetKey: prevState.resetKey };
  }

  const raw = {
    conversationId: formData.get("conversationId") as string,
    body: formData.get("body") as string,
    bodyFormat: (formData.get("bodyFormat") as string) || "html",
  };

  const parsed = sendMessageSchema.safeParse(raw);
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {};
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0]);
      if (!fieldErrors[key]) fieldErrors[key] = issue.message;
    }
    return { errors: fieldErrors, message: "", success: false, resetKey: prevState.resetKey };
  }

  const { conversationId, body, bodyFormat } = parsed.data;
  const sanitizedBody = bodyFormat === "html" ? sanitizeBody(body) : body;

  // Check that body has actual visible content (not just empty HTML tags like <p></p>)
  const textContent = sanitizedBody.replace(/<[^>]*>/g, "").trim();
  if (!textContent) {
    return { errors: { body: "Message is required" }, message: "", success: false, resetKey: prevState.resetKey };
  }

  const supabase = await createClient();

  // Verify user is a participant (RLS does this too, but fail with a clear message)
  const { data: conv, error: convError } = await supabase
    .from("dm_conversations")
    .select("id")
    .eq("id", conversationId)
    .single();

  if (convError || !conv) {
    return { errors: null, message: "Conversation not found.", success: false, resetKey: prevState.resetKey };
  }

  const { error } = await supabase.from("dm_messages").insert({
    conversation_id: conversationId,
    sender_id: user.id,
    body: sanitizedBody,
    body_format: bodyFormat,
  });

  if (error) {
    return { errors: null, message: `Failed to send message: ${error.message}`, success: false, resetKey: prevState.resetKey };
  }

  revalidatePath(`/community/messages/${conversationId}`);
  return { errors: null, message: "", success: true, resetKey: prevState.resetKey + 1 };
}

// ---------------------------------------------------------------------------
// Edit message (imperative — called directly, throws on error)
// ---------------------------------------------------------------------------

export async function editMessage(messageId: string, body: string, bodyFormat: "text" | "html" = "html"): Promise<void> {
  validateUUID(messageId, "message");

  const parsed = editMessageSchema.safeParse({ messageId, body, bodyFormat });
  if (!parsed.success) throw new Error(parsed.error.issues[0].message);

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const sanitizedBody = bodyFormat === "html" ? sanitizeBody(body) : body;
  const supabase = await createClient();

  const { data: msg, error: fetchError } = await supabase
    .from("dm_messages")
    .select("sender_id, conversation_id")
    .eq("id", messageId)
    .single();

  if (fetchError || !msg) throw new Error("Message not found");
  if (msg.sender_id !== user.id) throw new Error("You can only edit your own messages");

  const { error } = await supabase
    .from("dm_messages")
    .update({
      body: sanitizedBody,
      body_format: bodyFormat,
      edited_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) throw new Error(`Failed to edit message: ${error.message}`);

  revalidatePath(`/community/messages/${msg.conversation_id}`);
}

// ---------------------------------------------------------------------------
// Delete message (soft delete)
// ---------------------------------------------------------------------------

export async function deleteMessage(messageId: string): Promise<void> {
  validateUUID(messageId, "message");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { data: msg, error: fetchError } = await supabase
    .from("dm_messages")
    .select("sender_id, conversation_id")
    .eq("id", messageId)
    .single();

  if (fetchError || !msg) throw new Error("Message not found");
  if (msg.sender_id !== user.id) throw new Error("You can only delete your own messages");

  const { error } = await supabase
    .from("dm_messages")
    .update({
      deleted_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", messageId);

  if (error) throw new Error(`Failed to delete message: ${error.message}`);

  revalidatePath(`/community/messages/${msg.conversation_id}`);
}

// ---------------------------------------------------------------------------
// Mark conversation as read
// ---------------------------------------------------------------------------

export async function markAsRead(conversationId: string): Promise<void> {
  validateUUID(conversationId, "conversation");

  const user = await getAuthUser();
  if (!user) throw new Error("Not authenticated");

  const supabase = await createClient();

  const { error } = await supabase
    .from("dm_read_receipts")
    .upsert(
      {
        conversation_id: conversationId,
        user_id: user.id,
        last_read_at: new Date().toISOString(),
      },
      { onConflict: "conversation_id,user_id" },
    );

  if (error) throw new Error(`Failed to mark as read: ${error.message}`);

  revalidatePath("/community/messages");
}

// ---------------------------------------------------------------------------
// Start conversation (find or create, then redirect)
// ---------------------------------------------------------------------------

export async function startConversation(
  prevState: DmActionState,
  formData: FormData,
): Promise<DmActionState> {
  const user = await getAuthUser();
  if (!user) {
    return { errors: null, message: "You must be logged in.", success: false, resetKey: prevState.resetKey };
  }

  const raw = { recipientId: formData.get("recipientId") as string };
  const parsed = startConversationSchema.safeParse(raw);
  if (!parsed.success) {
    return { errors: { recipientId: parsed.error.issues[0].message }, message: "", success: false, resetKey: prevState.resetKey };
  }

  if (parsed.data.recipientId === user.id) {
    return { errors: null, message: "You cannot message yourself.", success: false, resetKey: prevState.resetKey };
  }

  const supabase = await createClient();

  const { data: convId, error } = await supabase.rpc("dm_get_or_create_conversation", {
    _other_user_id: parsed.data.recipientId,
  });

  if (error) {
    return { errors: null, message: `Failed to start conversation: ${error.message}`, success: false, resetKey: prevState.resetKey };
  }

  revalidatePath("/community/messages");
  redirect(`/community/messages/${convId}`);
}
