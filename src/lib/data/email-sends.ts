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

// Every Supabase call in this module is bounded by a timeout so a saturated
// database fails fast (thrown, with context) instead of hanging until the
// serverless function's max duration. Unbounded awaits on the email hot paths
// (the Brevo webhook, the drain/reconcile crons, the public unsubscribe/view
// routes) hold a function instance and a Postgres connection open for minutes
// under load — that's how a provider retry-storm turns into a compute-burn
// storm. See the Jun 2026 Fluid-burn incident and the CLAUDE.md storm-proofing
// invariant. Modeled on INGEST_DB_TIMEOUT_MS in src/lib/data/conversations.ts.
const EMAIL_DB_TIMEOUT_MS = 5000;

export type EmailSendRecipientInput = {
  contactId: string | null;
  email: string;
  name: string;
  status: EmailSendRecipient["status"];
  personalization: Record<string, unknown>;
  skipReason?: string | null;
};

export interface EmailSendListItem extends EmailSend {
  /** Name of the saved template this send was rendered from, or null when the
   * send wasn't linked to one. Used as the row title in the Sent emails list. */
  template_name: string | null;
}

/** Pull the nested template name out of a PostgREST embed (which arrives as an
 * object or, defensively, a single-element array). */
function resolveJoinedTemplateName(versionJoin: unknown): string | null {
  const version = Array.isArray(versionJoin) ? versionJoin[0] : versionJoin;
  const templateJoin = (version as { email_templates?: unknown } | null)
    ?.email_templates;
  const template = Array.isArray(templateJoin) ? templateJoin[0] : templateJoin;
  const name = (template as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.trim() ? name.trim() : null;
}

export const listEmailSends = cache(
  async function listEmailSends(): Promise<EmailSendListItem[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_sends")
      // Disambiguate the inner embed: email_template_versions and email_templates
      // have two FKs between them (template_id and the current_version_id
      // back-reference), so PostgREST needs the constraint name spelled out.
      .select(
        "*, email_template_versions(email_templates!email_template_versions_template_id_fkey(name))",
      )
      .order("created_at", { ascending: false })
      .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

    if (error) throw new Error(`Failed to load sent emails: ${error.message}`);
    return (data ?? []).map((row) => {
      const { email_template_versions: versionJoin, ...send } = row as Record<
        string,
        unknown
      >;
      return {
        ...(send as unknown as EmailSend),
        template_name: resolveJoinedTemplateName(versionJoin),
      };
    });
  },
);

export const getEmailSend = cache(
  async function getEmailSend(id: string): Promise<EmailSend | null> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("email_sends")
      .select("*")
      .eq("id", id)
      .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
      .maybeSingle();

    if (error) throw new Error(`Failed to load email send: ${error.message}`);
    return data as EmailSend | null;
  },
);

export interface EmailSendTemplateInfo {
  templateName: string;
  versionNumber: number;
}

/**
 * Resolve which saved template version a send was rendered from, so the Sent
 * emails view can label a campaign with its template name + version. Returns
 * null when the send wasn't linked to a template (e.g. a one-off design whose
 * auto-save didn't run).
 */
export async function getEmailSendTemplateInfo(
  sendId: string,
): Promise<EmailSendTemplateInfo | null> {
  const supabase = await createClient();
  const { data: send, error } = await supabase
    .from("email_sends")
    .select("template_version_id")
    .eq("id", sendId)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
    .maybeSingle();
  if (error) throw new Error(`Failed to load email send: ${error.message}`);

  const versionId = (send?.template_version_id as string | null) ?? null;
  if (!versionId) return null;

  const { data: version, error: versionError } = await supabase
    .from("email_template_versions")
    .select("version_number, email_templates(name)")
    .eq("id", versionId)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
    .maybeSingle();
  if (versionError) {
    throw new Error(`Failed to load template version: ${versionError.message}`);
  }
  if (!version) return null;

  const templateRecord = Array.isArray(version.email_templates)
    ? version.email_templates[0]
    : version.email_templates;
  const templateName =
    (templateRecord as { name?: string } | null)?.name?.trim() ||
    "Untitled template";

  return {
    templateName,
    versionNumber: version.version_number as number,
  };
}

export async function getEmailSendForWorker(
  id: string,
): Promise<EmailSend | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("email_sends")
    .select("*")
    .eq("id", id)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
    .maybeSingle();

  if (error) throw new Error(`Failed to load email send: ${error.message}`);
  return data as EmailSend | null;
}

export interface EmailSendWebVersion {
  builder_json_snapshot: Record<string, unknown>;
  preview_text: string;
  from_name: string;
  from_email: string;
  reply_to_email: string;
}

/**
 * Public lookup for the "View in browser" web version, keyed by the send's
 * unguessable public token. Recipients have no session, so this uses the admin
 * client — but it's scoped to the token and returns only the content needed to
 * re-render the (non-personalized) email, never recipient PII.
 */
export async function getEmailSendByPublicToken(
  token: string,
): Promise<EmailSendWebVersion | null> {
  if (!token.trim()) return null;
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .from("email_sends")
    .select(
      "builder_json_snapshot, preview_text, from_name, from_email, reply_to_email",
    )
    .eq("public_token", token)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
    .maybeSingle();

  if (error) {
    throw new Error(`Failed to load email web version: ${error.message}`);
  }
  return (data as EmailSendWebVersion | null) ?? null;
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
      .order("created_at", { ascending: true })
      .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
      .order("occurred_at", { ascending: false })
      .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
  const { data, error } = await supabase
    .rpc("create_email_send_with_recipients", {
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
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) throw new Error(`Failed to create email send: ${error.message}`);
  return data as EmailSend;
}

export async function queueEmailSend(sendId: string): Promise<EmailSend> {
  const profile = await requireAdmin();
  const supabase = await createClient();
  const { data, error } = await supabase
    .rpc("queue_email_send", {
      p_send_id: sendId,
      p_user_id: profile.id,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
    .eq("id", sendId)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));
  if (error) {
    throw new Error(`Failed to link template to send: ${error.message}`);
  }
}

// Any send can be deleted except one that is actively 'sending' — removing a
// send mid-dispatch (its recipients are being claimed/sent) would race the
// drain/worker and risk duplicate or orphaned deliveries. Terminal sends
// (sent / partially_failed / failed) and not-yet-started ones (draft / queued)
// are safe to remove; the cascade clears their recipients + events.
const REMOVABLE_SEND_STATUSES = [
  "draft",
  "queued",
  "sent",
  "partially_failed",
  "failed",
];

export async function deleteRemovableEmailSend(sendId: string): Promise<boolean> {
  await requireAdmin();
  const supabase = await createClient();

  // Gate on status first so we never strip events from a send we then can't
  // delete (e.g. one that flipped to 'sending'). The delete below re-checks the
  // status, so this is just to avoid touching events for a non-removable send.
  const { data: existing, error: lookupError } = await supabase
    .from("email_sends")
    .select("status")
    .eq("id", sendId)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
    .maybeSingle();
  if (lookupError) {
    throw new Error(`Failed to load email send: ${lookupError.message}`);
  }
  if (
    !existing ||
    !REMOVABLE_SEND_STATUSES.includes((existing as { status: string }).status)
  ) {
    return false;
  }

  // Remove the send's events explicitly. email_events.send_id is ON DELETE SET
  // NULL, so deleting the send alone would leave them as orphans (recipient_id
  // also nulled), which the reconcile cron would then churn on every tick.
  // Recipients cascade with the send, so they don't need a manual delete.
  const { error: eventsError } = await supabase
    .from("email_events")
    .delete()
    .eq("send_id", sendId)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));
  if (eventsError) {
    throw new Error(`Failed to delete email send events: ${eventsError.message}`);
  }

  const { data, error } = await supabase
    .from("email_sends")
    .delete()
    .eq("id", sendId)
    .in("status", REMOVABLE_SEND_STATUSES)
    .select("id")
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
    .maybeSingle();

  if (error) throw new Error(`Failed to delete email send: ${error.message}`);
  return Boolean(data);
}

export async function claimQueuedEmailRecipients(input: {
  sendId: string;
  limit: number;
}): Promise<EmailSendRecipient[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .rpc("claim_queued_email_recipients", {
      p_send_id: input.sendId,
      p_limit: input.limit,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
  // Goes through an RPC (not a plain update) so the status only advances
  // pending/queued/sending -> sent. If a delivery webhook already won the race
  // and advanced this recipient (delivered/opened/clicked/bounced/...), that
  // status is preserved rather than clobbered back to 'sent'. The RPC also merges
  // provider_metadata server-side, so no read-modify-write is needed here.
  const { error } = await supabase
    .rpc("mark_email_recipient_sent", {
      p_recipient_id: recipientId,
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_provider_metadata: input.providerMetadata,
      p_rendered_subject: input.renderedSubject,
      p_rendered_html: input.renderedHtml,
      p_rendered_text: input.renderedText,
      p_unsubscribe_token_hash: input.unsubscribeTokenHash,
      p_last_error: null,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) throw new Error(`Failed to mark email recipient sent: ${error.message}`);
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
    .eq("id", recipientId)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) {
    throw new Error(`Failed to prepare email recipient: ${error.message}`);
  }
}

export async function markEmailRecipientFailed(
  recipientId: string,
  message: string,
): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .rpc("mark_email_recipient_failure", {
      p_recipient_id: recipientId,
      p_message: message,
      p_max_attempts: 3,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
  // Same no-downgrade "sent" writer; records the post-acceptance error in
  // last_error. Provider accepted the email, so the recipient must not look
  // failed — but if a webhook already advanced it, we keep that.
  const { error } = await supabase
    .rpc("mark_email_recipient_sent", {
      p_recipient_id: recipientId,
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_provider_metadata: input.providerMetadata,
      p_rendered_subject: null,
      p_rendered_html: null,
      p_rendered_text: null,
      p_unsubscribe_token_hash: null,
      p_last_error: input.message,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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

  const { data: existing, error: selectError } = await selectQuery
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
    .maybeSingle();
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
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
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
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
    .maybeSingle();

  if (error && error.code === "23505") return null;
  if (error) throw new Error(`Failed to append email event: ${error.message}`);
  return data as EmailEvent | null;
}

export async function updateEmailSendCounts(sendId: string): Promise<void> {
  const supabase = await createAdminClient();
  const { error } = await supabase
    .rpc("update_email_send_counts", {
      p_send_id: sendId,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) throw new Error(`Failed to update email send counts: ${error.message}`);
}

/**
 * Re-queue the genuinely-failed recipients of a send (status = 'failed') for
 * another delivery attempt, and flip the send back to 'queued'. Returns how many
 * recipients were re-queued. Deferred / bounced / complained / unsubscribed /
 * skipped recipients are intentionally left untouched (see the
 * requeue_failed_email_recipients RPC); suppression is re-checked when each
 * recipient is re-claimed for sending.
 */
export async function requeueFailedEmailRecipients(
  sendId: string,
): Promise<number> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .rpc("requeue_failed_email_recipients", {
      p_send_id: sendId,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) {
    throw new Error(`Failed to re-queue failed recipients: ${error.message}`);
  }
  return typeof data === "number" ? data : 0;
}

function recipientRowOrNull(data: unknown): EmailSendRecipient | null {
  // The apply_email_provider_event* RPCs RETURN a composite row; when the UPDATE
  // matched nothing, plpgsql yields a row with all-NULL fields (a *truthy* object),
  // NOT SQL NULL. Collapse that to null so callers' "no recipient" branches work.
  if (data && typeof data === "object" && (data as { id?: unknown }).id) {
    return data as EmailSendRecipient;
  }
  return null;
}

export async function updateRecipientForProviderEvent(input: {
  provider: string;
  providerMessageId: string;
  status: EmailSendRecipient["status"];
  timestampField:
    | "delivered_at"
    | "opened_at"
    | "clicked_at"
    | "deferred_at"
    | "bounced_at"
    | "complained_at"
    | "unsubscribed_at";
  occurredAt: string;
}): Promise<EmailSendRecipient | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .rpc("apply_email_provider_event", {
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_status: input.status,
      p_timestamp_field: input.timestampField,
      p_occurred_at: input.occurredAt,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) {
    throw new Error(`Failed to update email recipient event: ${error.message}`);
  }
  return recipientRowOrNull(data);
}

/**
 * Apply a provider event matched by our own recipient id (from the webhook's
 * X-Mailin-custom metadata) instead of by provider_message_id. This is
 * race-proof: a fast delivery/engagement webhook lands on the right recipient
 * even if the send-path hasn't persisted the provider_message_id yet, and the
 * RPC backfills that id so later msgid-based events still match. Returns null if
 * no recipient with that id exists.
 */
export async function updateRecipientForProviderEventByRecipient(input: {
  recipientId: string;
  provider: string;
  providerMessageId: string | null;
  status: EmailSendRecipient["status"];
  timestampField:
    | "delivered_at"
    | "opened_at"
    | "clicked_at"
    | "deferred_at"
    | "bounced_at"
    | "complained_at"
    | "unsubscribed_at";
  occurredAt: string;
}): Promise<EmailSendRecipient | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .rpc("apply_email_provider_event_by_recipient", {
      p_recipient_id: input.recipientId,
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_status: input.status,
      p_timestamp_field: input.timestampField,
      p_occurred_at: input.occurredAt,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) {
    throw new Error(
      `Failed to apply email recipient event by recipient: ${error.message}`,
    );
  }
  return recipientRowOrNull(data);
}

/**
 * Record a "loaded by proxy" open (Apple Mail Privacy Protection et al.), matched
 * by provider_message_id. Sets proxy_opened_at only — never a status or opened_at
 * — so a privacy-proxy pre-fetch is never mistaken for a confirmed human open.
 */
export async function updateRecipientForProxyOpen(input: {
  provider: string;
  providerMessageId: string;
  occurredAt: string;
}): Promise<EmailSendRecipient | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .rpc("apply_email_proxy_open", {
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_occurred_at: input.occurredAt,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) {
    throw new Error(`Failed to apply proxy open: ${error.message}`);
  }
  return recipientRowOrNull(data);
}

/**
 * Race-proof proxy-open variant matched by our own recipient id (from the
 * webhook's X-Mailin-custom metadata). Lands even if the send-path hasn't
 * persisted the provider_message_id yet, and backfills it.
 */
export async function updateRecipientForProxyOpenByRecipient(input: {
  recipientId: string;
  provider: string;
  providerMessageId: string | null;
  occurredAt: string;
}): Promise<EmailSendRecipient | null> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .rpc("apply_email_proxy_open_by_recipient", {
      p_recipient_id: input.recipientId,
      p_provider: input.provider,
      p_provider_message_id: input.providerMessageId,
      p_occurred_at: input.occurredAt,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) {
    throw new Error(`Failed to apply proxy open by recipient: ${error.message}`);
  }
  return recipientRowOrNull(data);
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
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
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
    .in("status", ["pending", "queued", "sending"])
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error) throw new Error(`Failed to load email queue state: ${error.message}`);
  const statuses = (data ?? []) as Array<Pick<EmailSendRecipient, "status">>;
  return {
    pending: statuses.filter((row) => row.status === "pending").length,
    queued: statuses.filter((row) => row.status === "queued").length,
    sending: statuses.filter((row) => row.status === "sending").length,
  };
}

/**
 * Backstop: re-link provider events that landed without a recipient
 * (recipient_id IS NULL) using our X-Mailin-custom metadata, re-apply them, and
 * refresh affected send counts. Returns how many events were reconciled. Run
 * from the reconcile cron; safe to run repeatedly.
 */
export async function reconcileOrphanEmailEvents(limit = 500): Promise<number> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .rpc("reconcile_orphan_email_events", {
      p_limit: limit,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));
  if (error) {
    throw new Error(`Failed to reconcile orphan email events: ${error.message}`);
  }
  return typeof data === "number" ? data : 0;
}

/**
 * Send ids still in flight that have recipients which never went out
 * (pending/queued) or are stalled mid-send. The drain cron processes each so a
 * killed serverless invocation can never leave a send permanently unfinished.
 */
export async function getEmailSendsNeedingProcessing(
  limit = 25,
): Promise<string[]> {
  const supabase = await createAdminClient();
  const { data, error } = await supabase
    .rpc("email_sends_needing_processing", {
      p_limit: limit,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));
  if (error) {
    throw new Error(
      `Failed to load email sends needing processing: ${error.message}`,
    );
  }
  if (!Array.isArray(data)) return [];
  // RETURNS SETOF uuid → PostgREST may yield bare strings or { <fn name>: uuid }.
  return (data as Array<unknown>)
    .map((row) =>
      typeof row === "string"
        ? row
        : ((row as Record<string, string>)?.email_sends_needing_processing ??
          null),
    )
    .filter((id): id is string => typeof id === "string");
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
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
  const { error } = await supabase
    .from("contact_email_preferences")
    .upsert({
      contact_id: input.contactId,
      newsletter_unsubscribed_at: now,
      newsletter_unsubscribed_source: input.source,
      updated_by: null,
      updated_at: now,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
  const { error } = await supabase
    .from("email_suppressions")
    .insert({
      contact_id: input.contactId,
      email: input.email.trim().toLowerCase(),
      reason: "unsubscribe",
      detail: `Unsubscribed via ${input.source}`,
      provider: null,
      provider_event_id: null,
      created_by: null,
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error && error.code !== "23505") {
    throw new Error(`Failed to suppress unsubscribed email: ${error.message}`);
  }
}

export const listContactEmailPreferences = cache(
  async function listContactEmailPreferences(): Promise<ContactEmailPreference[]> {
    const supabase = await createClient();
    const { data, error } = await supabase
      .from("contact_email_preferences")
      .select("*")
      .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
      .is("lifted_at", null)
      .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

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
    })
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));

  if (error && error.code !== "23505") {
    throw new Error(`Failed to suppress email: ${error.message}`);
  }
}

export async function unsubscribeNewsletterByToken(
  token: string,
  feedback?: { reason?: string | null; comment?: string | null },
): Promise<boolean> {
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const supabase = await createAdminClient();
  const { data: recipient, error } = await supabase
    .from("email_send_recipients")
    .select("*")
    .eq("unsubscribe_token_hash", tokenHash)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS))
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
      })
      .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));
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
    .eq("id", row.id)
    .abortSignal(AbortSignal.timeout(EMAIL_DB_TIMEOUT_MS));
  if (recipientError) {
    throw new Error(`Failed to update email recipient: ${recipientError.message}`);
  }

  const reason = feedback?.reason?.trim() || null;
  const comment = feedback?.comment?.trim() || null;
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
    // Optional self-reported reason/comment, kept on the event as the audit
    // trail (JSONB payload — no schema change).
    payload: {
      source: "email_link",
      ...(reason ? { reason } : {}),
      ...(comment ? { comment } : {}),
    },
  });
  await updateEmailSendCounts(row.send_id);
  return true;
}
