import { createHash, randomBytes } from "node:crypto";
import {
  appendEmailEvent,
  claimQueuedEmailRecipients,
  getEmailSendForWorker,
  getEmailSendQueueState,
  markEmailRecipientFailed,
  markEmailRecipientPrepared,
  markEmailRecipientReconciliationNeeded,
  markEmailRecipientSent,
  updateEmailSendCounts,
} from "@/lib/data/email-sends";
import { createSystemContactEvent } from "@/lib/data/contact-events";
import type { EmailSend, EmailSendRecipient } from "@/types/database";
import type { EmailProvider, ProviderSendEmailResult } from "./provider/types";
import {
  assertMailyDocument,
  getMailyDocumentWidth,
  renderMailyEmail,
} from "./rendering/maily";
import { injectWebviewLink } from "./rendering/webview-link";
import { type EmailRenderVariables } from "./rendering/variables";
import { getEmailTestRecipientOverride, getPublicSiteUrl } from "./settings";

const DEFAULT_CHUNK_SIZE = 25;
const DEFAULT_MAX_CHUNKS = 20;

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function buildRenderVariables(
  send: EmailSend,
  recipient: EmailSendRecipient,
  unsubscribeUrl: string | null,
): EmailRenderVariables {
  const personalization = asRecord(recipient.personalization_snapshot);
  const contact = asRecord(personalization.contact);
  return {
    ...personalization,
    contact: {
      id:
        typeof contact.id === "string"
          ? contact.id
          : (recipient.contact_id ?? undefined),
      name:
        typeof contact.name === "string"
          ? contact.name
          : recipient.contact_name_snapshot,
      email: typeof contact.email === "string" ? contact.email : recipient.email,
    },
    unsubscribe: {
      url: unsubscribeUrl ?? "",
    },
    owner: {
      name: send.from_name,
      email: send.from_email,
      replyToEmail: send.reply_to_email,
    },
  };
}

function createUnsubscribeToken(): { token: string; hash: string } {
  const token = randomBytes(32).toString("base64url");
  const hash = createHash("sha256").update(token).digest("hex");
  return { token, hash };
}

function getProviderRecipientEmail(recipient: EmailSendRecipient): string {
  return getEmailTestRecipientOverride() || recipient.email;
}

function hasTestRecipientOverride(): boolean {
  return Boolean(getEmailTestRecipientOverride());
}

function getProviderRecipientEmailForError(
  recipient: EmailSendRecipient,
): string {
  try {
    return getProviderRecipientEmail(recipient);
  } catch {
    return recipient.email;
  }
}

async function createSentEmailTimelineEvent(input: {
  send: EmailSend;
  recipient: EmailSendRecipient;
  renderedSubject: string;
  provider: string;
  providerMessageId: string;
  occurredAt: string;
}) {
  if (!input.recipient.contact_id) return;

  await createSystemContactEvent({
    contactId: input.recipient.contact_id,
    type: "custom",
    customLabel: "Email sent",
    body: `Subject: ${input.renderedSubject}\nDelivery: Not delivered yet`,
    happenedAt: input.occurredAt,
    authorId:
      input.send.confirmed_by ?? input.send.updated_by ?? input.send.created_by,
    authorName: "BTM Hub",
    metadata: {
      source: "email_sends",
      send_id: input.send.id,
      recipient_id: input.recipient.id,
      provider: input.provider,
      provider_message_id: input.providerMessageId,
      subject: input.renderedSubject,
      email: input.recipient.email,
      kind: input.send.kind,
      delivery_status: "pending",
    },
  });
}

async function renderRecipient(input: {
  send: EmailSend;
  recipient: EmailSendRecipient;
  unsubscribeUrl: string | null;
}) {
  const document = assertMailyDocument(input.send.builder_json_snapshot);
  // The unsubscribe link is the admin's to place (a Button/link whose URL is the
  // unsubscribe.url variable, resolved here per recipient). The RFC-8058
  // List-Unsubscribe header below is always sent, so one-click unsubscribe works
  // regardless of the body.
  const rendered = await renderMailyEmail({
    subject: input.send.subject_template,
    previewText: input.send.preview_text,
    document,
    variables: buildRenderVariables(
      input.send,
      input.recipient,
      input.unsubscribeUrl,
    ),
  });
  // "View in browser" escape hatch shown to every client, for when an email
  // renders poorly (most useful in Outlook, which clips long emails). Post-render
  // in the pipeline, so the renderer is untouched and the web version itself is
  // never given the link.
  const html = input.send.public_token
    ? injectWebviewLink(
        rendered.html,
        `${getPublicSiteUrl()}/email/view/${input.send.public_token}`,
        getMailyDocumentWidth(document),
      )
    : rendered.html;
  return {
    subject: rendered.subject,
    html,
    text: rendered.text,
  };
}

async function processRecipient(input: {
  send: EmailSend;
  recipient: EmailSendRecipient;
  provider: EmailProvider;
}) {
  let acceptedResult: ProviderSendEmailResult | null = null;
  try {
    // Every email gets a per-recipient unsubscribe token, so the footer link +
    // RFC-8058 one-click header work for both newsletters and targeted sends.
    // Unsubscribing writes a suppression that blocks all future email.
    const unsubscribe = createUnsubscribeToken();
    const unsubscribeUrl = `${getPublicSiteUrl()}/email/unsubscribe/${unsubscribe.token}`;
    // RFC-8058 one-click target: a POST endpoint that unsubscribes without any
    // further interaction (Gmail/Yahoo bulk-sender requirement).
    const oneClickUnsubscribeUrl = `${getPublicSiteUrl()}/api/email/unsubscribe/${unsubscribe.token}`;
    const rendered = await renderRecipient({
      send: input.send,
      recipient: input.recipient,
      unsubscribeUrl,
    });
    const providerRecipientEmail = getProviderRecipientEmail(input.recipient);
    const testRecipientOverride = hasTestRecipientOverride();
    await markEmailRecipientPrepared(input.recipient.id, {
      provider: input.provider.name,
      providerRecipientEmail,
      testRecipientOverride,
      renderedSubject: rendered.subject,
      renderedHtml: rendered.html,
      renderedText: rendered.text,
      unsubscribeTokenHash: unsubscribe?.hash ?? null,
    });
    const result = await input.provider.sendEmail({
      recipientId: input.recipient.id,
      // Use the per-dispatch idempotency key assigned by
      // claim_queued_email_recipients: it is STABLE across a stalled re-claim and
      // regenerated only on an intentional retry of a failed recipient. So a
      // re-send of a recipient that stalled AFTER Brevo already accepted it reuses
      // the SAME key and Brevo dedupes it — no double delivery — while a genuine
      // retry gets a fresh key and actually re-sends. Fallback to the legacy
      // per-attempt hash only for rows claimed before this column existed.
      idempotencyKey:
        input.recipient.idempotency_key ??
        createHash("sha256")
          .update(`${input.recipient.id}:${input.recipient.send_attempts}`)
          .digest("hex")
          .slice(0, 36),
      sendId: input.send.id,
      contactId: input.recipient.contact_id,
      to: providerRecipientEmail,
      fromEmail: input.send.from_email,
      fromName: input.send.from_name,
      replyTo: input.send.reply_to_email,
      subject: rendered.subject,
      html: rendered.html,
      text: rendered.text,
      metadata: {
        sendId: input.send.id,
        recipientId: input.recipient.id,
        contactId: input.recipient.contact_id ?? "",
      },
      headers: {
        "List-Unsubscribe": `<${oneClickUnsubscribeUrl}>`,
        "List-Unsubscribe-Post": "List-Unsubscribe=One-Click",
      },
    });
    acceptedResult = result;
    const providerMetadata = {
      providerRecipientEmail,
      providerResponse: result.raw,
      testRecipientOverride,
    };
    const occurredAt = new Date().toISOString();

    await markEmailRecipientSent(input.recipient.id, {
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      providerMetadata,
      renderedSubject: rendered.subject,
      renderedHtml: rendered.html,
      renderedText: rendered.text,
      unsubscribeTokenHash: unsubscribe?.hash ?? null,
    });
    await appendEmailEvent({
      sendId: input.send.id,
      recipientId: input.recipient.id,
      contactId: input.recipient.contact_id,
      type: "sent",
      provider: result.provider,
      providerEventId: null,
      providerMessageId: result.providerMessageId,
      eventFingerprint: `${result.provider}:sent:${result.providerMessageId}`,
      occurredAt,
      payload: result.raw,
    });
    await createSentEmailTimelineEvent({
      send: input.send,
      recipient: input.recipient,
      renderedSubject: rendered.subject,
      provider: result.provider,
      providerMessageId: result.providerMessageId,
      occurredAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const providerRecipientEmail = getProviderRecipientEmailForError(
      input.recipient,
    );
    if (!acceptedResult) {
      console.error("Email send failed before provider acceptance", {
        sendId: input.send.id,
        recipientId: input.recipient.id,
        provider: input.provider.name,
        providerRecipientEmail,
        message,
      });
    }
    if (acceptedResult) {
      try {
        await markEmailRecipientReconciliationNeeded(input.recipient.id, {
          provider: acceptedResult.provider,
          providerMessageId: acceptedResult.providerMessageId,
          providerMetadata: {
            providerRecipientEmail,
            providerResponse: acceptedResult.raw,
            testRecipientOverride: providerRecipientEmail !== input.recipient.email,
          },
          message,
        });
      } catch {
        // The provider already accepted the email; avoid marking it as failed.
      }
      return;
    }
    await markEmailRecipientFailed(
      input.recipient.id,
      `${message} (provider recipient: ${providerRecipientEmail})`,
    );
  }
}

export async function processEmailSendChunks(input: {
  sendId: string;
  provider: EmailProvider;
  chunkSize?: number;
  maxChunks?: number;
}): Promise<{ processed: number; hasMore: boolean }> {
  const send = await getEmailSendForWorker(input.sendId);
  if (!send) throw new Error("Email send not found");

  const chunkSize = input.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const maxChunks = input.maxChunks ?? DEFAULT_MAX_CHUNKS;
  let processed = 0;
  for (let index = 0; index < maxChunks; index += 1) {
    const recipients = await claimQueuedEmailRecipients({
      sendId: input.sendId,
      limit: chunkSize,
    });
    if (recipients.length === 0) break;
    processed += recipients.length;
    await Promise.all(
      recipients.map((recipient) =>
        processRecipient({
          send,
          recipient,
          provider: input.provider,
        }),
      ),
    );
  }

  await updateEmailSendCounts(input.sendId);
  const state = await getEmailSendQueueState(input.sendId);
  return {
    processed,
    hasMore: state.pending + state.queued > 0,
  };
}
