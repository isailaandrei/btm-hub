import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type EmailTimelineItem =
  | {
      id: string;
      type: "email_sent";
      happened_at: string;
      label: string;
      body: string;
      recipientId: string;
      campaignId: string;
    }
  | {
      id: string;
      type: "email_reply";
      happened_at: string;
      label: string;
      body: string;
      replyId: string;
      recipientId: string | null;
      forwardStatus: "pending" | "forwarded" | "failed";
    };

export function buildEmailTimelineItems(input: {
  recipients: Array<{
    id: string;
    campaign_id: string;
    contact_id: string | null;
    email: string;
    contact_name_snapshot: string;
    status: string;
    sent_at: string | null;
  }>;
  replies: Array<{
    id: string;
    recipient_id: string | null;
    contact_id: string | null;
    subject: string;
    body_preview: string;
    received_at: string;
    forward_status: "pending" | "forwarded" | "failed";
  }>;
}): EmailTimelineItem[] {
  const sent = input.recipients
    .filter((recipient) => recipient.sent_at)
    .map((recipient) => ({
      id: `email-sent-${recipient.id}`,
      type: "email_sent" as const,
      happened_at: recipient.sent_at as string,
      label: "Email sent",
      body: `Sent to ${recipient.email}`,
      recipientId: recipient.id,
      campaignId: recipient.campaign_id,
    }));

  const replies = input.replies.map((reply) => ({
    id: `email-reply-${reply.id}`,
    type: "email_reply" as const,
    happened_at: reply.received_at,
    label: `Email reply: ${reply.subject || "(no subject)"}`,
    body: reply.body_preview,
    replyId: reply.id,
    recipientId: reply.recipient_id,
    forwardStatus: reply.forward_status,
  }));

  return [...sent, ...replies].sort((a, b) =>
    b.happened_at.localeCompare(a.happened_at),
  );
}

export const getEmailTimelineItems = cache(
  async function getEmailTimelineItems(contactId: string): Promise<EmailTimelineItem[]> {
    const supabase = await createClient();
    const [recipientsResult, repliesResult] = await Promise.all([
      supabase
        .from("email_campaign_recipients")
        .select("id, campaign_id, contact_id, email, contact_name_snapshot, status, sent_at")
        .eq("contact_id", contactId),
      supabase
        .from("email_replies")
        .select("id, recipient_id, contact_id, subject, body_preview, received_at, forward_status")
        .eq("contact_id", contactId),
    ]);

    if (recipientsResult.error) {
      throw new Error(`Failed to load email timeline recipients: ${recipientsResult.error.message}`);
    }
    if (repliesResult.error) {
      throw new Error(`Failed to load email timeline replies: ${repliesResult.error.message}`);
    }

    return buildEmailTimelineItems({
      recipients: (recipientsResult.data ?? []) as Parameters<
        typeof buildEmailTimelineItems
      >[0]["recipients"],
      replies: (repliesResult.data ?? []) as Parameters<
        typeof buildEmailTimelineItems
      >[0]["replies"],
    });
  },
);
