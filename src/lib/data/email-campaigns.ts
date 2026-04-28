import { cache } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  EmailProvider,
  NormalizedInboundReply,
  NormalizedProviderEvent,
} from "@/lib/email/provider/types";
import { extractRecipientIdFromReplyAddress } from "@/lib/email/reply-matching";
import type {
  EmailCampaign,
  EmailCampaignKind,
  EmailCampaignRecipient,
  EmailEvent,
  EmailEventType,
  EmailReply,
  EmailSuppression,
  EmailSuppressionReason,
  ContactEmailPreference,
} from "@/types/database";

export const listEmailCampaigns = cache(
  async function listEmailCampaigns(): Promise<EmailCampaign[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_campaigns")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to load email campaigns: ${error.message}`);
    return (data ?? []) as EmailCampaign[];
  },
);

export async function createEmailCampaign(input: {
  kind: EmailCampaignKind;
  name: string;
  subject: string;
  previewText: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  templateVersionId: string | null;
  htmlSnapshot: string;
  textSnapshot: string;
}): Promise<EmailCampaign> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_campaigns")
    .insert({
      kind: input.kind,
      name: input.name,
      subject: input.subject,
      preview_text: input.previewText,
      from_email: input.fromEmail,
      from_name: input.fromName,
      reply_to_email: input.replyToEmail,
      template_version_id: input.templateVersionId,
      html_snapshot: input.htmlSnapshot,
      text_snapshot: input.textSnapshot,
      created_by: profile.id,
      updated_by: profile.id,
    })
    .select("*")
    .single();

  if (error) throw new Error(`Failed to create email campaign: ${error.message}`);
  return data as EmailCampaign;
}

export async function insertEmailRecipients(input: {
  campaignId: string;
  recipients: Array<{
    contactId: string;
    email: string;
    name: string;
    personalization: Record<string, unknown>;
  }>;
}): Promise<EmailCampaignRecipient[]> {
  await requireAdmin();
  const supabase = await createClient();
  const rows = input.recipients.map((recipient) => ({
    campaign_id: input.campaignId,
    contact_id: recipient.contactId,
    email: recipient.email,
    contact_name_snapshot: recipient.name,
    personalization_snapshot: recipient.personalization,
    status: "pending",
  }));
  const { data, error } = await supabase
    .from("email_campaign_recipients")
    .insert(rows)
    .select("*");

  if (error) throw new Error(`Failed to create email recipients: ${error.message}`);
  return (data ?? []) as EmailCampaignRecipient[];
}

export async function appendEmailEvent(input: {
  campaignId: string | null;
  recipientId: string | null;
  contactId: string | null;
  type: EmailEventType;
  provider: string | null;
  providerEventId: string | null;
  providerMessageId: string | null;
  occurredAt: string;
  payload: Record<string, unknown>;
}): Promise<EmailEvent | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_events")
    .insert({
      campaign_id: input.campaignId,
      recipient_id: input.recipientId,
      contact_id: input.contactId,
      type: input.type,
      provider: input.provider,
      provider_event_id: input.providerEventId,
      provider_message_id: input.providerMessageId,
      occurred_at: input.occurredAt,
      payload: input.payload,
    })
    .select("*")
    .maybeSingle();

  if (error && error.code === "23505") return null;
  if (error) throw new Error(`Failed to append email event: ${error.message}`);
  return data as EmailEvent | null;
}

export async function suppressEmail(input: {
  contactId: string | null;
  email: string;
  reason: EmailSuppressionReason;
  detail: string;
  provider?: string;
  providerEventId?: string;
}): Promise<void> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_suppressions")
    .insert({
      contact_id: input.contactId,
      email: input.email.trim().toLowerCase(),
      reason: input.reason,
      detail: input.detail,
      provider: input.provider ?? null,
      provider_event_id: input.providerEventId ?? null,
      created_by: profile.id,
    });

  if (error && error.code !== "23505") {
    throw new Error(`Failed to suppress email: ${error.message}`);
  }
}

export async function insertEmailReply(
  input: Omit<EmailReply, "id" | "created_at">,
): Promise<EmailReply | null> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_replies")
    .insert(input)
    .select("*")
    .maybeSingle();

  if (error && error.code === "23505") return null;
  if (error) throw new Error(`Failed to store email reply: ${error.message}`);
  return data as EmailReply | null;
}

export const listContactEmailPreferences = cache(
  async function listContactEmailPreferences(): Promise<ContactEmailPreference[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contact_email_preferences")
      .select("*");

    if (error) {
      throw new Error(`Failed to load contact email preferences: ${error.message}`);
    }
    return (data ?? []) as ContactEmailPreference[];
  },
);

export const listActiveEmailSuppressions = cache(
  async function listActiveEmailSuppressions(): Promise<EmailSuppression[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_suppressions")
      .select("*")
      .is("lifted_at", null);

    if (error) {
      throw new Error(`Failed to load email suppressions: ${error.message}`);
    }
    return (data ?? []) as EmailSuppression[];
  },
);

export async function markRecipientSent(
  recipientId: string,
  input: {
    provider: string;
    providerMessageId: string;
    providerMetadata: Record<string, unknown>;
  },
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_campaign_recipients")
    .update({
      status: "sent",
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      provider_metadata: input.providerMetadata,
      sent_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipientId);

  if (error) throw new Error(`Failed to mark email recipient sent: ${error.message}`);
}

export async function markRecipientFailed(
  recipientId: string,
  errorMessage: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_campaign_recipients")
    .update({
      status: "failed",
      last_error: errorMessage,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipientId);

  if (error) throw new Error(`Failed to mark email recipient failed: ${error.message}`);
}

export async function updateCampaignSendCounts(campaignId: string): Promise<void> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_campaign_recipients")
    .select("status")
    .eq("campaign_id", campaignId);

  if (error) throw new Error(`Failed to load email recipient counts: ${error.message}`);

  const recipients = (data ?? []) as Array<{ status: string }>;
  const count = (statuses: string[]) =>
    recipients.filter((recipient) => statuses.includes(recipient.status)).length;

  const failedCount = count(["failed"]);
  const sentCount = count([
    "sent",
    "delivered",
    "opened",
    "clicked",
    "replied",
  ]);

  const { error: updateError } = await supabase
    .from("email_campaigns")
    .update({
      status:
        failedCount > 0 && sentCount > 0
          ? "partially_failed"
          : failedCount > 0
            ? "failed"
            : "sent",
      recipient_count: recipients.length,
      sent_count: sentCount,
      delivered_count: count(["delivered", "opened", "clicked", "replied"]),
      opened_count: count(["opened", "clicked", "replied"]),
      clicked_count: count(["clicked"]),
      bounced_count: count(["bounced"]),
      complained_count: count(["complained"]),
      replied_count: count(["replied"]),
      failed_count: failedCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", campaignId);

  if (updateError) {
    throw new Error(`Failed to update email campaign counts: ${updateError.message}`);
  }
}

export async function queueCampaignForSending(
  campaignId: string,
): Promise<EmailCampaign> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const now = new Date().toISOString();

  const { error: recipientsError } = await supabase
    .from("email_campaign_recipients")
    .update({
      status: "queued",
      queued_at: now,
      updated_at: now,
    })
    .eq("campaign_id", campaignId)
    .eq("status", "pending");

  if (recipientsError) {
    throw new Error(`Failed to queue email recipients: ${recipientsError.message}`);
  }

  const { data, error } = await supabase
    .from("email_campaigns")
    .update({
      status: "sending",
      confirmed_by: profile.id,
      confirmed_at: now,
      updated_by: profile.id,
      updated_at: now,
    })
    .eq("id", campaignId)
    .select("*")
    .single();

  if (error) throw new Error(`Failed to queue email campaign: ${error.message}`);
  return data as EmailCampaign;
}

export async function listQueuedRecipients(
  campaignId: string,
): Promise<EmailCampaignRecipient[]> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_campaign_recipients")
    .select("*")
    .eq("campaign_id", campaignId)
    .eq("status", "queued")
    .order("created_at", { ascending: true });

  if (error) throw new Error(`Failed to load queued recipients: ${error.message}`);
  return (data ?? []) as EmailCampaignRecipient[];
}

function statusPatchForEvent(type: EmailEventType, occurredAt: string) {
  switch (type) {
    case "delivered":
      return { status: "delivered", delivered_at: occurredAt };
    case "delivery_delayed":
      return { status: "delivery_delayed" };
    case "opened":
      return { status: "opened", opened_at: occurredAt };
    case "clicked":
      return { status: "clicked", clicked_at: occurredAt };
    case "bounced":
      return { status: "bounced", bounced_at: occurredAt };
    case "complained":
      return { status: "complained", complained_at: occurredAt };
    case "failed":
      return { status: "failed", last_error: "Provider reported failure" };
    case "reply_received":
      return { status: "replied", replied_at: occurredAt };
    default:
      return null;
  }
}

export async function applyProviderEvent(
  event: NormalizedProviderEvent,
): Promise<void> {
  const supabase = await createAdminClient();
  const recipient =
    event.providerMessageId == null
      ? null
      : await supabase
          .from("email_campaign_recipients")
          .select("*")
          .eq("provider", event.provider)
          .eq("provider_message_id", event.providerMessageId)
          .maybeSingle();

  if (recipient?.error) {
    throw new Error(`Failed to find email recipient: ${recipient.error.message}`);
  }

  const recipientData = recipient?.data as EmailCampaignRecipient | null | undefined;
  const { error: eventError } = await supabase
    .from("email_events")
    .insert({
      campaign_id: recipientData?.campaign_id ?? null,
      recipient_id: recipientData?.id ?? null,
      contact_id: recipientData?.contact_id ?? null,
      type: event.type,
      provider: event.provider,
      provider_event_id: event.providerEventId,
      provider_message_id: event.providerMessageId,
      occurred_at: event.occurredAt,
      payload: event.payload,
    });

  if (eventError?.code === "23505") return;
  if (eventError) throw new Error(`Failed to append email event: ${eventError.message}`);

  if (!recipientData) return;

  const patch = statusPatchForEvent(event.type, event.occurredAt);
  if (patch) {
    const { error: updateError } = await supabase
      .from("email_campaign_recipients")
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq("id", recipientData.id);

    if (updateError) {
      throw new Error(`Failed to update email recipient status: ${updateError.message}`);
    }
  }

  if (event.type === "bounced" || event.type === "complained") {
    const { error: suppressionError } = await supabase
      .from("email_suppressions")
      .insert({
        contact_id: recipientData.contact_id,
        email: recipientData.email,
        reason: event.type === "bounced" ? "hard_bounce" : "spam_complaint",
        detail:
          event.type === "bounced"
            ? "Provider reported hard bounce."
            : "Provider reported spam complaint.",
        provider: event.provider,
        provider_event_id: event.providerEventId,
      });

    if (suppressionError && suppressionError.code !== "23505") {
      throw new Error(`Failed to suppress email: ${suppressionError.message}`);
    }
  }
}

export async function storeInboundReplyAndForward(
  reply: NormalizedInboundReply,
  provider: EmailProvider,
): Promise<void> {
  const ownerMailbox = process.env.OWNER_EMAIL_FORWARD_TO?.trim();
  if (!ownerMailbox) throw new Error("Missing OWNER_EMAIL_FORWARD_TO");

  const supabase = await createAdminClient();
  const recipientId = extractRecipientIdFromReplyAddress(reply.inboundTo);
  const recipientResult = recipientId
    ? await supabase
        .from("email_campaign_recipients")
        .select("*")
        .eq("id", recipientId)
        .maybeSingle()
    : null;

  if (recipientResult?.error) {
    throw new Error(`Failed to load email recipient: ${recipientResult.error.message}`);
  }

  const recipient = recipientResult?.data as EmailCampaignRecipient | null | undefined;
  const { data: storedReply, error: replyError } = await supabase
    .from("email_replies")
    .insert({
      campaign_id: recipient?.campaign_id ?? null,
      recipient_id: recipient?.id ?? null,
      contact_id: recipient?.contact_id ?? null,
      provider: reply.provider,
      provider_message_id: reply.providerMessageId,
      provider_event_id: reply.providerEventId,
      inbound_to: reply.inboundTo,
      inbound_from: reply.inboundFrom,
      subject: reply.subject,
      text_body: reply.textBody,
      html_body: reply.htmlBody,
      body_preview: reply.textBody.slice(0, 240),
      attachment_metadata: reply.attachmentMetadata,
      forwarded_to: ownerMailbox,
      forwarded_at: null,
      forward_status: "pending",
      forward_error: null,
      received_at: reply.receivedAt,
    })
    .select("*")
    .maybeSingle();

  if (replyError?.code === "23505") return;
  if (replyError) throw new Error(`Failed to store email reply: ${replyError.message}`);
  if (!storedReply) return;

  await supabase.from("email_events").insert({
    campaign_id: recipient?.campaign_id ?? null,
    recipient_id: recipient?.id ?? null,
    contact_id: recipient?.contact_id ?? null,
    type: "reply_received",
    provider: reply.provider,
    provider_event_id: reply.providerEventId,
    provider_message_id: reply.providerMessageId,
    occurred_at: reply.receivedAt,
    payload: reply.payload,
  });

  if (recipient) {
    await supabase
      .from("email_campaign_recipients")
      .update({
        status: "replied",
        replied_at: reply.receivedAt,
        updated_at: new Date().toISOString(),
      })
      .eq("id", recipient.id);
  }

  try {
    await provider.forwardInboundReply({
      replyId: (storedReply as EmailReply).id,
      to: ownerMailbox,
      from: reply.inboundFrom,
      subject: reply.subject,
      textBody: reply.textBody,
      htmlBody: reply.htmlBody,
      attachmentMetadata: reply.attachmentMetadata,
    });
    const { error: forwardError } = await supabase
      .from("email_replies")
      .update({
        forward_status: "forwarded",
        forwarded_at: new Date().toISOString(),
      })
      .eq("id", (storedReply as EmailReply).id);
    if (forwardError) {
      throw new Error(`Failed to mark reply forwarded: ${forwardError.message}`);
    }
    await supabase.from("email_events").insert({
      campaign_id: recipient?.campaign_id ?? null,
      recipient_id: recipient?.id ?? null,
      contact_id: recipient?.contact_id ?? null,
      type: "reply_forwarded",
      provider: reply.provider,
      provider_event_id: `${reply.providerEventId}:forwarded`,
      provider_message_id: reply.providerMessageId,
      occurred_at: new Date().toISOString(),
      payload: {},
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await supabase
      .from("email_replies")
      .update({
        forward_status: "failed",
        forward_error: message,
      })
      .eq("id", (storedReply as EmailReply).id);
    await supabase.from("email_events").insert({
      campaign_id: recipient?.campaign_id ?? null,
      recipient_id: recipient?.id ?? null,
      contact_id: recipient?.contact_id ?? null,
      type: "reply_forward_failed",
      provider: reply.provider,
      provider_event_id: `${reply.providerEventId}:forward_failed`,
      provider_message_id: reply.providerMessageId,
      occurred_at: new Date().toISOString(),
      payload: { error: message },
    });
  }
}
