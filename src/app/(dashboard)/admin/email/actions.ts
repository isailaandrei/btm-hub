"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import { getContacts } from "@/lib/data/contacts";
import {
  createEmailSendWithRecipients,
  deleteRemovableEmailSend,
  listActiveEmailSuppressions,
  listContactEmailPreferences,
  listEmailSends,
  listEmailEventsForSend,
  listEmailSendRecipients,
  queueEmailSend,
} from "@/lib/data/email-sends";
import {
  getEmailTemplateVersion,
  listEmailTemplates,
} from "@/lib/data/email-templates";
import { resolveEmailEligibility } from "@/lib/email/eligibility";
import {
  assertMailyDocument,
  renderMailyDocument,
} from "@/lib/email/rendering/maily";
import {
  getEmailFromEmail,
  getEmailFromName,
  getEmailReplyToEmail,
  getEmailWorkerSecret,
} from "@/lib/email/settings";
import { getEmailProvider } from "@/lib/email/provider";
import { processEmailSendChunks } from "@/lib/email/send-pipeline";
import { triggerEmailWorker } from "@/lib/email/worker-trigger";
import { validateUUID } from "@/lib/validation-helpers";
import type { EmailEvent, EmailSendKind } from "@/types/database";

const emailKindSchema = z.enum(["broadcast", "outreach"]);
const INLINE_SEND_CAPACITY = 25 * 20;

const previewEmailSchema = z.object({
  kind: emailKindSchema,
  contactIds: z.array(z.string()).optional(),
  subject: z.string().trim().min(1, "Subject is required"),
  templateVersionId: z.string().min(1, "Template is required"),
});

const draftEmailSchema = previewEmailSchema.extend({
  name: z
    .string()
    .trim()
    .min(1, "Email name is required")
    .max(160, "Email name must be 160 characters or fewer")
    .optional(),
  builderJson: z.unknown(),
  previewText: z
    .string()
    .trim()
    .max(200, "Preview text must be 200 characters or fewer")
    .optional(),
});

type ParsedEmailSendInput = z.infer<typeof draftEmailSchema>;

export async function loadEmailStudioDataAction() {
  await requireAdmin();
  const [templates, sends] = await Promise.all([
    listEmailTemplates(),
    listEmailSends(),
  ]);

  return { templates, sends };
}

async function resolvePreview(input: {
  kind: EmailSendKind;
  contactIds?: string[];
}) {
  if (input.kind === "outreach") {
    const selectedIds = input.contactIds ?? [];
    if (selectedIds.length === 0) throw new Error("Select at least one contact");
    for (const contactId of selectedIds) validateUUID(contactId, "contact");
  }

  const [contacts, preferences, suppressions] = await Promise.all([
    getContacts(),
    listContactEmailPreferences(),
    listActiveEmailSuppressions(),
  ]);

  return resolveEmailEligibility({
    kind: input.kind,
    contacts,
    preferences,
    suppressions,
    selectedContactIds: input.contactIds,
  });
}

export async function previewEmailAction(input: {
  kind: EmailSendKind;
  contactIds?: string[];
  subject: string;
  templateVersionId: string;
}): Promise<{
  eligibleCount: number;
  skipped: Array<{
    contactId: string;
    email: string;
    name: string;
    reason: string;
  }>;
}> {
  await requireAdmin();
  const parsed = previewEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email preview");
  }
  validateUUID(parsed.data.templateVersionId, "template version");

  const preview = await resolvePreview(parsed.data);
  return {
    eligibleCount: preview.eligible.length,
    skipped: preview.skipped,
  };
}

export async function createEmailDraftAction(input: {
  kind: EmailSendKind;
  name?: string;
  subject: string;
  templateVersionId: string;
  builderJson: unknown;
  previewText?: string;
  contactIds?: string[];
}): Promise<{ sendId: string }> {
  await requireAdmin();
  const parsed = draftEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email draft");
  }
  validateUUID(parsed.data.templateVersionId, "template version");

  const send = await createEmailSend(parsed.data);
  revalidatePath("/admin");
  return { sendId: send.id };
}

async function createEmailSend(input: ParsedEmailSendInput) {
  const [templateVersion, preview] = await Promise.all([
    getEmailTemplateVersion(input.templateVersionId),
    resolvePreview(input),
  ]);
  if (!templateVersion) throw new Error("Template version not found");
  if (preview.eligible.length > INLINE_SEND_CAPACITY && !getEmailWorkerSecret()) {
    throw new Error(
      "EMAIL_WORKER_SECRET must be set before sending more than 500 recipients.",
    );
  }

  const document = assertMailyDocument(input.builderJson);
  const previewText = input.previewText ?? "";
  const rendered = await renderMailyDocument(document, {
    previewText,
  });
  const name = input.name ?? input.subject;
  const recipients = [
    ...preview.eligible.map((recipient) => ({
      contactId: recipient.contactId,
      email: recipient.email,
      name: recipient.name,
      status: "pending" as const,
      personalization: recipient.personalization,
      skipReason: null,
    })),
    ...preview.skipped.map((recipient) => ({
      contactId: recipient.contactId,
      email: recipient.email,
      name: recipient.name,
      status: recipient.status,
      personalization: {
        contact: {
          id: recipient.contactId,
          name: recipient.name,
          email: recipient.email,
        },
      },
      skipReason: recipient.reason,
    })),
  ];

  return createEmailSendWithRecipients({
    kind: input.kind,
    name,
    subjectTemplate: input.subject,
    previewText,
    fromEmail: getEmailFromEmail(),
    fromName: getEmailFromName(),
    replyToEmail: getEmailReplyToEmail(),
    templateVersionId: templateVersion.id,
    builderJsonSnapshot: document as Record<string, unknown>,
    htmlPreviewSnapshot: rendered.html,
    textPreviewSnapshot: rendered.text,
    metadata: {
      editor: "maily",
    },
    recipients,
  });
}

export async function confirmEmailSendAction(
  sendId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(sendId, "email send");
  const provider = getEmailProvider();
  const send = await queueEmailSend(sendId);

  after(async () => {
    const result = await processEmailSendChunks({
      sendId: send.id,
      provider,
    });
    if (result.hasMore) {
      await triggerEmailWorker(send.id);
    }
  });

  revalidatePath("/admin");
  return { ok: true };
}

export async function sendEmailNowAction(input: {
  kind: EmailSendKind;
  name?: string;
  subject: string;
  templateVersionId: string;
  builderJson: unknown;
  previewText?: string;
  contactIds?: string[];
}): Promise<{ sendId: string }> {
  await requireAdmin();
  const parsed = draftEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email send");
  }
  validateUUID(parsed.data.templateVersionId, "template version");

  const provider = getEmailProvider();
  const send = await createEmailSend(parsed.data);
  const queuedSend = await queueEmailSend(send.id);

  after(async () => {
    const result = await processEmailSendChunks({
      sendId: queuedSend.id,
      provider,
    });
    if (result.hasMore) {
      await triggerEmailWorker(queuedSend.id);
    }
  });

  revalidatePath("/admin");
  return { sendId: queuedSend.id };
}

export async function deleteEmailSendAction(
  sendId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(sendId, "email send");

  const deleted = await deleteRemovableEmailSend(sendId);
  if (!deleted) {
    throw new Error("Email not found or it can no longer be removed.");
  }

  revalidatePath("/admin");
  return { ok: true };
}

export type EmailSendDiagnostics = {
  recipients: Array<{
    id: string;
    email: string;
    name: string;
    status: string;
    skipReason: string | null;
    provider: string | null;
    providerMessageId: string | null;
    providerRecipientEmail: string | null;
    testRecipientOverride: boolean;
    attempts: number;
    lastError: string | null;
    failureReason: string | null;
    sentAt: string | null;
    deliveredAt: string | null;
    openedAt: string | null;
    clickedAt: string | null;
    bouncedAt: string | null;
    complainedAt: string | null;
    unsubscribedAt: string | null;
    updatedAt: string;
  }>;
};

function readProviderRecipientMetadata(metadata: Record<string, unknown>) {
  return {
    providerRecipientEmail:
      typeof metadata.providerRecipientEmail === "string"
        ? metadata.providerRecipientEmail
        : null,
    testRecipientOverride: metadata.testRecipientOverride === true,
  };
}

function readStringPayloadField(
  payload: Record<string, unknown>,
  keys: string[],
) {
  for (const key of keys) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) {
      return String(value);
    }
  }
  return null;
}

function formatProviderEventName(event: EmailEvent) {
  const rawEvent = readStringPayloadField(event.payload, ["event"]) ?? event.type;
  return rawEvent.replaceAll("_", " ");
}

function formatProviderName(provider: string | null) {
  if (provider === "brevo") return "Brevo";
  return provider ?? "Provider";
}

function formatProviderFailureReason(event: EmailEvent) {
  const reason = readStringPayloadField(event.payload, [
    "reason",
    "description",
    "message",
    "error",
    "error_code",
  ]);
  if (!reason) return null;
  return `${formatProviderName(event.provider)} ${formatProviderEventName(
    event,
  )}: ${reason}`;
}

function buildFailureReasonsByRecipient(events: EmailEvent[]) {
  const reasons = new Map<string, string>();
  for (const event of events) {
    if (!event.recipient_id || reasons.has(event.recipient_id)) continue;
    const reason = formatProviderFailureReason(event);
    if (reason) reasons.set(event.recipient_id, reason);
  }
  return reasons;
}

export async function getEmailSendDiagnosticsAction(
  sendId: string,
): Promise<EmailSendDiagnostics> {
  await requireAdmin();
  validateUUID(sendId, "email send");

  const [recipients, events] = await Promise.all([
    listEmailSendRecipients(sendId),
    listEmailEventsForSend(sendId),
  ]);
  const failureReasons = buildFailureReasonsByRecipient(events);
  return {
    recipients: recipients.map((recipient) => {
      const providerMetadata = readProviderRecipientMetadata(
        recipient.provider_metadata,
      );
      return {
        id: recipient.id,
        email: recipient.email,
        name: recipient.contact_name_snapshot,
        status: recipient.status,
        skipReason: recipient.skip_reason,
        provider: recipient.provider,
        providerMessageId: recipient.provider_message_id,
        ...providerMetadata,
        attempts: recipient.send_attempts,
        lastError: recipient.last_error,
        failureReason:
          recipient.last_error ?? failureReasons.get(recipient.id) ?? null,
        sentAt: recipient.sent_at,
        deliveredAt: recipient.delivered_at,
        openedAt: recipient.opened_at,
        clickedAt: recipient.clicked_at,
        bouncedAt: recipient.bounced_at,
        complainedAt: recipient.complained_at,
        unsubscribedAt: recipient.unsubscribed_at,
        updatedAt: recipient.updated_at,
      };
    }),
  };
}
