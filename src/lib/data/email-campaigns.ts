import { cache } from "react";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createClient } from "@/lib/supabase/server";
import type {
  EmailCampaign,
  EmailCampaignKind,
  EmailCampaignRecipient,
  EmailEvent,
  EmailEventType,
  EmailReply,
  EmailSuppressionReason,
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
