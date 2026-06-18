import { cache } from "react";
import { createHash } from "node:crypto";
import { requireAdmin } from "@/lib/auth/require-admin";
import { createAdminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type {
  ContactEmailPreference,
  EmailEvent,
  EmailEventType,
  EmailSend,
  EmailSendKind,
  EmailSendRecipient,
  EmailSuppression,
  EmailSuppressionReason,
} from "@/types/database";

export type EmailSendRecipientInput = {
  contactId: string | null;
  email: string;
  name: string;
  status: EmailSendRecipient["status"];
  personalization: Record<string, unknown>;
  skipReason?: string | null;
};

export const listEmailSends = cache(
  async function listEmailSends(): Promise<EmailSend[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_sends")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(`Failed to load sent emails: ${error.message}`);
    return (data ?? []) as EmailSend[];
  },
);

export const getEmailSend = cache(
  async function getEmailSend(id: string): Promise<EmailSend | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_sends")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error) throw new Error(`Failed to load email send: ${error.message}`);
    return data as EmailSend | null;
  },
);

export async function getEmailSendForWorker(
  id: string,
): Promise<EmailSend | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("email_sends")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw new Error(`Failed to load email send: ${error.message}`);
  return data as EmailSend | null;
}

export const listEmailSendRecipients = cache(
  async function listEmailSendRecipients(
    sendId: string,
  ): Promise<EmailSendRecipient[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_send_recipients")
      .select("*")
      .eq("send_id", sendId)
      .order("created_at", { ascending: true });

    if (error) throw new Error(`Failed to load email recipients: ${error.message}`);
    return (data ?? []) as EmailSendRecipient[];
  },
);

export const listEmailEventsForSend = cache(
  async function listEmailEventsForSend(sendId: string): Promise<EmailEvent[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_events")
      .select("*")
      .eq("send_id", sendId)
      .in("type", ["bounced", "failed", "delivery_delayed"])
      .order("occurred_at", { ascending: false });

    if (error) throw new Error(`Failed to load email events: ${error.message}`);
    return (data ?? []) as EmailEvent[];
  },
);

export async function createEmailSendWithRecipients(input: {
  kind: EmailSendKind;
  name: string;
  subjectTemplate: string;
  previewText: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  templateVersionId: string | null;
  builderJsonSnapshot: Record<string, unknown>;
  htmlPreviewSnapshot: string;
  textPreviewSnapshot: string;
  metadata?: Record<string, unknown>;
  recipients: EmailSendRecipientInput[];
}): Promise<EmailSend> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(
    "create_email_send_with_recipients",
    {
      p_kind: input.kind,
      p_name: input.name,
      p_subject_template: input.subjectTemplate,
      p_preview_text: input.previewText,
      p_from_email: input.fromEmail,
      p_from_name: input.fromName,
      p_reply_to_email: input.replyToEmail,
      p_template_version_id: input.templateVersionId,
      p_builder_json_snapshot: input.builderJsonSnapshot,
      p_html_preview_snapshot: input.htmlPreviewSnapshot,
      p_text_preview_snapshot: input.textPreviewSnapshot,
      p_metadata: input.metadata ?? {},
      p_recipients: input.recipients.map((recipient) => ({
        contact_id: recipient.contactId,
        email: recipient.email,
        name: recipient.name,
        status: recipient.status,
        personalization: recipient.personalization,
        skip_reason: recipient.skipReason ?? null,
      })),
      p_user_id: profile.id,
    },
  );

  if (error) throw new Error(`Failed to create email send: ${error.message}`);
  return data as EmailSend;
}

export async function queueEmailSend(sendId: string): Promise<EmailSend> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("queue_email_send", {
    p_send_id: sendId,
    p_user_id: profile.id,
  });

  if (error) throw new Error(`Failed to queue email send: ${error.message}`);
  return data as EmailSend;
}

/**
 * Link a send to the template version that captured its design. Done after the
 * send is created so a failed send never leaves an orphaned published template.
 */
export async function setEmailSendTemplateVersion(
  sendId: string,
  templateVersionId: string,
): Promise<void> {
  const supabase = await createClient();
  const { error } = await supabase
    .from("email_sends")
    .update({
      template_version_id: templateVersionId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", sendId);
  if (error) {
    throw new Error(`Failed to link template to send: ${error.message}`);
  }
}

export async function deleteRemovableEmailSend(sendId: string): Promise<boolean> {
  await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("email_sends")
    .delete()
    .eq("id", sendId)
    .in("status", ["draft", "queued", "failed"])
    .select("id")
    .maybeSingle();

  if (error) throw new Error(`Failed to delete email send: ${error.message}`);
  return Boolean(data);
}

export async function claimQueuedEmailRecipients(input: {
  sendId: string;
  limit: number;
}): Promise<EmailSendRecipient[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc("claim_queued_email_recipients", {
    p_send_id: input.sendId,
    p_limit: input.limit,
  });

  if (error) throw new Error(`Failed to claim email recipients: ${error.message}`);
  return (data ?? []) as EmailSendRecipient[];
}

export async function markEmailRecipientSent(
  recipientId: string,
  input: {
    provider: string;
    providerMessageId: string;
    providerMetadata: Record<string, unknown>;
    renderedSubject: string;
    renderedHtml: string;
    renderedText: string;
    unsubscribeTokenHash: string | null;
  },
): Promise<void> {
  const supabase = await createAdminClient();
  const providerMetadata = await readRecipientProviderMetadata(recipientId);
  const { error } = await supabase
    .from("email_send_recipients")
    .update({
      status: "sent",
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      provider_metadata: {
        ...providerMetadata,
        ...input.providerMetadata,
      },
      rendered_subject: input.renderedSubject,
      rendered_html: input.renderedHtml,
      rendered_text: input.renderedText,
      unsubscribe_token_hash: input.unsubscribeTokenHash,
      sent_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipientId);

  if (error) throw new Error(`Failed to mark email recipient sent: ${error.message}`);
}

async function readRecipientProviderMetadata(
  recipientId: string,
): Promise<Record<string, unknown>> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("email_send_recipients")
    .select("provider_metadata")
    .eq("id", recipientId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load email recipient metadata: ${error.message}`);
  }

  const metadata = (data as { provider_metadata?: unknown } | null)
    ?.provider_metadata;
  return metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? (metadata as Record<string, unknown>)
    : {};
}

export async function markEmailRecipientPrepared(
  recipientId: string,
  input: {
    provider: string;
    providerRecipientEmail: string;
    testRecipientOverride: boolean;
    renderedSubject: string;
    renderedHtml: string;
    renderedText: string;
    unsubscribeTokenHash: string | null;
  },
): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("email_send_recipients")
    .update({
      provider: input.provider,
      provider_metadata: {
        providerRecipientEmail: input.providerRecipientEmail,
        testRecipientOverride: input.testRecipientOverride,
      },
      rendered_subject: input.renderedSubject,
      rendered_html: input.renderedHtml,
      rendered_text: input.renderedText,
      unsubscribe_token_hash: input.unsubscribeTokenHash,
      last_error: null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipientId);

  if (error) {
    throw new Error(`Failed to prepare email recipient: ${error.message}`);
  }
}

export async function markEmailRecipientFailed(
  recipientId: string,
  message: string,
): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("mark_email_recipient_failure", {
    p_recipient_id: recipientId,
    p_message: message,
    p_max_attempts: 3,
  });

  if (error) {
    throw new Error(`Failed to mark email recipient failed: ${error.message}`);
  }
}

export async function markEmailRecipientReconciliationNeeded(
  recipientId: string,
  input: {
    provider: string;
    providerMessageId: string;
    providerMetadata: Record<string, unknown>;
    message: string;
  },
): Promise<void> {
  const supabase = await createAdminClient();
  const providerMetadata = await readRecipientProviderMetadata(recipientId);
  const { error } = await supabase
    .from("email_send_recipients")
    .update({
      status: "sent",
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      provider_metadata: {
        ...providerMetadata,
        ...input.providerMetadata,
      },
      sent_at: new Date().toISOString(),
      last_error: input.message,
      updated_at: new Date().toISOString(),
    })
    .eq("id", recipientId);

  if (error) {
    throw new Error(
      `Failed to mark email recipient for reconciliation: ${error.message}`,
    );
  }
}

export async function attachProviderMessageToRecipient(input: {
  provider: string;
  providerMessageId: string;
  recipientId: string;
  sendId: string | null;
  contactId: string | null;
}): Promise<EmailSendRecipient | null> {
  const supabase = await createAdminClient();
  let selectQuery = supabase
    .from("email_send_recipients")
    .select("*")
    .eq("id", input.recipientId);
  if (input.sendId) selectQuery = selectQuery.eq("send_id", input.sendId);
  if (input.contactId) {
    selectQuery = selectQuery.eq("contact_id", input.contactId);
  }

  const { data: existing, error: selectError } = await selectQuery.maybeSingle();
  if (selectError) {
    throw new Error(
      `Failed to load email recipient for webhook reconciliation: ${selectError.message}`,
    );
  }
  if (!existing) return null;

  const current = existing as EmailSendRecipient;
  if (
    current.provider_message_id &&
    current.provider_message_id !== input.providerMessageId
  ) {
    return null;
  }

  const { data, error } = await supabase
    .from("email_send_recipients")
    .update({
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      provider_metadata: {
        ...current.provider_metadata,
        reconciledFromWebhook: true,
      },
      updated_at: new Date().toISOString(),
    })
    .eq("id", current.id)
    .select("*")
    .maybeSingle();

  if (error) {
    throw new Error(
      `Failed to attach provider message to recipient: ${error.message}`,
    );
  }
  return data as EmailSendRecipient | null;
}

export async function appendEmailEvent(input: {
  sendId: string | null;
  recipientId: string | null;
  contactId: string | null;
  type: EmailEventType;
  provider: string | null;
  providerEventId: string | null;
  providerMessageId: string | null;
  eventFingerprint: string;
  occurredAt: string;
  payload: Record<string, unknown>;
}): Promise<EmailEvent | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("email_events")
    .insert({
      send_id: input.sendId,
      recipient_id: input.recipientId,
      contact_id: input.contactId,
      type: input.type,
      provider: input.provider,
      provider_event_id: input.providerEventId,
      provider_message_id: input.providerMessageId,
      event_fingerprint: input.eventFingerprint,
      occurred_at: input.occurredAt,
      payload: input.payload,
    })
    .select("*")
    .maybeSingle();

  if (error && error.code === "23505") return null;
  if (error) throw new Error(`Failed to append email event: ${error.message}`);
  return data as EmailEvent | null;
}

export async function updateEmailSendCounts(sendId: string): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase.rpc("update_email_send_counts", {
    p_send_id: sendId,
  });

  if (error) throw new Error(`Failed to update email send counts: ${error.message}`);
}

export async function updateRecipientForProviderEvent(input: {
  provider: string;
  providerMessageId: string;
  status: EmailSendRecipient["status"];
  timestampField:
    | "delivered_at"
    | "opened_at"
    | "clicked_at"
    | "bounced_at"
    | "complained_at"
    | "unsubscribed_at";
  occurredAt: string;
}): Promise<EmailSendRecipient | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase.rpc("apply_email_provider_event", {
    p_provider: input.provider,
    p_provider_message_id: input.providerMessageId,
    p_status: input.status,
    p_timestamp_field: input.timestampField,
    p_occurred_at: input.occurredAt,
  });

  if (error) {
    throw new Error(`Failed to update email recipient event: ${error.message}`);
  }
  return data as EmailSendRecipient | null;
}

export async function getEmailRecipientByProviderMessage(input: {
  provider: string;
  providerMessageId: string;
}): Promise<EmailSendRecipient | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("email_send_recipients")
    .select("*")
    .eq("provider", input.provider)
    .eq("provider_message_id", input.providerMessageId)
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load email recipient event target: ${error.message}`);
  }
  return data as EmailSendRecipient | null;
}

export async function getEmailSendQueueState(sendId: string): Promise<{
  pending: number;
  queued: number;
  sending: number;
}> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("email_send_recipients")
    .select("status")
    .eq("send_id", sendId)
    .in("status", ["pending", "queued", "sending"]);

  if (error) throw new Error(`Failed to load email queue state: ${error.message}`);
  const statuses = (data ?? []) as Array<Pick<EmailSendRecipient, "status">>;
  return {
    pending: statuses.filter((row) => row.status === "pending").length,
    queued: statuses.filter((row) => row.status === "queued").length,
    sending: statuses.filter((row) => row.status === "sending").length,
  };
}

export async function suppressEmailFromProvider(input: {
  contactId: string | null;
  email: string;
  reason: Extract<EmailSuppressionReason, "hard_bounce" | "spam_complaint" | "invalid_address">;
  detail: string;
  provider: string;
  providerEventId: string | null;
}): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .from("email_suppressions")
    .insert({
      contact_id: input.contactId,
      email: input.email.trim().toLowerCase(),
      reason: input.reason,
      detail: input.detail,
      provider: input.provider,
      provider_event_id: input.providerEventId,
      created_by: null,
    });

  if (error && error.code !== "23505") {
    throw new Error(`Failed to suppress provider email: ${error.message}`);
  }
}

export async function recordProviderNewsletterUnsubscribe(input: {
  contactId: string | null;
  source: string;
}): Promise<void> {
  if (!input.contactId) return;
  const now = new Date().toISOString();
  const supabase = await createAdminClient();
  const { error } = await supabase.from("contact_email_preferences").upsert({
    contact_id: input.contactId,
    newsletter_unsubscribed_at: now,
    newsletter_unsubscribed_source: input.source,
    updated_by: null,
    updated_at: now,
  });

  if (error) {
    throw new Error(
      `Failed to update provider unsubscribe preference: ${error.message}`,
    );
  }
}

/**
 * Land an unsubscribed address on the single exclusion list. Flat exclusion:
 * once suppressed, the person receives no email of any kind. Safe to call when
 * an active suppression already exists (the unique partial index raises 23505,
 * which we ignore — they are already excluded). Uses the admin client because
 * it runs from the public unsubscribe route and the provider webhook.
 */
export async function suppressUnsubscribedEmail(input: {
  contactId: string | null;
  email: string;
  source: string;
}): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase.from("email_suppressions").insert({
    contact_id: input.contactId,
    email: input.email.trim().toLowerCase(),
    reason: "unsubscribe",
    detail: `Unsubscribed via ${input.source}`,
    provider: null,
    provider_event_id: null,
    created_by: null,
  });

  if (error && error.code !== "23505") {
    throw new Error(`Failed to suppress unsubscribed email: ${error.message}`);
  }
}

export const listContactEmailPreferences = cache(
  async function listContactEmailPreferences(): Promise<ContactEmailPreference[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contact_email_preferences")
      .select("*");

    if (error) {
      throw new Error(`Failed to load email preferences: ${error.message}`);
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

export async function suppressEmail(input: {
  contactId: string | null;
  email: string;
  reason: EmailSuppressionReason;
  detail: string;
  provider?: string;
  providerEventId?: string;
}): Promise<void> {
  const profile = await requireAdmin();
  const supabase = await createAdminClient();
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

export async function unsubscribeNewsletterByToken(
  token: string,
): Promise<boolean> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = await createAdminClient();
  const { data: recipient, error } = await supabase
    .from("email_send_recipients")
    .select("*")
    .eq("unsubscribe_token_hash", tokenHash)
    .maybeSingle();

  if (error) throw new Error(`Failed to load unsubscribe token: ${error.message}`);
  if (!recipient) return false;

  const row = recipient as EmailSendRecipient;
  if (row.contact_id) {
    const { error: preferenceError } = await supabase
      .from("contact_email_preferences")
      .upsert({
        contact_id: row.contact_id,
        newsletter_unsubscribed_at: new Date().toISOString(),
        newsletter_unsubscribed_source: "email_link",
        updated_by: null,
        updated_at: new Date().toISOString(),
      });
    if (preferenceError) {
      throw new Error(
        `Failed to update email preference: ${preferenceError.message}`,
      );
    }
  }

  // Flat exclusion: an unsubscribe stops all email, not just newsletters.
  await suppressUnsubscribedEmail({
    contactId: row.contact_id,
    email: row.email,
    source: "email_link",
  });

  const now = new Date().toISOString();
  const { error: recipientError } = await supabase
    .from("email_send_recipients")
    .update({
      status: "unsubscribed",
      unsubscribed_at: now,
      updated_at: now,
    })
    .eq("id", row.id);
  if (recipientError) {
    throw new Error(`Failed to update email recipient: ${recipientError.message}`);
  }

  await appendEmailEvent({
    sendId: row.send_id,
    recipientId: row.id,
    contactId: row.contact_id,
    type: "unsubscribed",
    provider: "internal",
    providerEventId: null,
    providerMessageId: row.provider_message_id,
    eventFingerprint: `internal:unsubscribe:${row.id}`,
    occurredAt: now,
    payload: { source: "email_link" },
  });
  await updateEmailSendCounts(row.send_id);
  return true;
}
