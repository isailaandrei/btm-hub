"use server";

import { revalidatePath } from "next/cache";
import { after } from "next/server";
import { z } from "zod/v4";
import { requireAdmin } from "@/lib/auth/require-admin";
import {
  getContactById,
  getContacts,
  getTagCategories,
  getTags,
} from "@/lib/data/contacts";
import {
  createEmailSendWithRecipients,
  deleteRemovableEmailSend,
  getEmailSendTemplateInfo,
  listActiveEmailSuppressions,
  listContactEmailPreferences,
  listEmailSends,
  listEmailEventsForSend,
  listEmailSendRecipients,
  queueEmailSend,
  setEmailSendTemplateVersion,
  type EmailSendTemplateInfo,
} from "@/lib/data/email-sends";
import {
  getEmailManualRecipientsByIds,
  listEmailManualRecipients,
  upsertEmailManualRecipient,
} from "@/lib/data/email-manual-recipients";
import {
  excludeContactEmail,
  listEmailExclusions,
  liftEmailExclusion,
  type EmailExclusionRow,
} from "@/lib/data/email-suppressions";
import {
  addEmailListMembers,
  createEmailList,
  deleteEmailList,
  getEmailListNames,
  getEmailListWithMembers,
  listEmailLists,
  removeEmailListMember,
  resolveEmailListRecipientIds,
  updateEmailList,
  type EmailListMemberRow,
  type EmailListSummary,
} from "@/lib/data/email-lists";
import {
  countSegmentMatches,
  createEmailSegment,
  deleteEmailSegment,
  getEmailSegmentNames,
  listEmailSegments,
  resolveSegmentsContactIds,
  updateEmailSegment,
  type EmailSegmentSummary,
} from "@/lib/data/email-segments";
import {
  getEmailTemplateVersion,
  listEmailTemplates,
} from "@/lib/data/email-templates";
import { resolveEmailEligibility } from "@/lib/email/eligibility";
import {
  assertMailyDocument,
  renderMailyDocument,
  renderMailyEmail,
} from "@/lib/email/rendering/maily";
import { findOrCreateTemplateForDocument } from "@/lib/email/template-authoring";
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
import type {
  EmailEvent,
  EmailList,
  EmailManualRecipient,
  EmailSegment,
  EmailSegmentRule,
  EmailSendKind,
  EmailSuppression,
  Tag,
  TagCategory,
} from "@/types/database";

const emailKindSchema = z.enum(["broadcast", "outreach"]);
const INLINE_SEND_CAPACITY = 25 * 20;

const previewEmailSchema = z.object({
  kind: emailKindSchema,
  contactIds: z.array(z.string()).optional(),
  manualRecipientIds: z.array(z.string()).optional(),
  listIds: z.array(z.string()).optional(),
  segmentIds: z.array(z.string()).optional(),
  subject: z.string().trim().min(1, "Subject is required"),
});

// The audience *source* an admin chose, persisted on the send so the Sent tab
// can name it (e.g. "Beginners segment") instead of showing only a count.
// Lists/segments arrive in later phases; the shape is forward-compatible.
const audienceSourceSchema = z
  .object({
    listIds: z.array(z.string()).optional(),
    segmentIds: z.array(z.string()).optional(),
    label: z.string().trim().max(200).optional(),
  })
  .optional();

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
  audience: audienceSourceSchema,
});

type ParsedEmailSendInput = z.infer<typeof draftEmailSchema>;
export type AudienceSourceInput = NonNullable<
  z.infer<typeof audienceSourceSchema>
>;

const manualRecipientSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email("Please enter a valid email address")),
  name: z.string().trim().max(160, "Name must be 160 characters or fewer").optional(),
  notes: z
    .string()
    .trim()
    .max(1000, "Notes must be 1000 characters or fewer")
    .optional(),
});

type ResolvedManualEligibleRecipient = {
  contactId: null;
  email: string;
  name: string;
  personalization: Record<string, unknown>;
};

type ResolvedManualSkippedRecipient = ResolvedManualEligibleRecipient & {
  status: "skipped_suppressed";
  reason: string;
};

export type EmailTemplateVersionDocument = {
  builderJson: Record<string, unknown>;
};

export type EmailTemplateVersionsById = Record<
  string,
  EmailTemplateVersionDocument
>;

async function loadTemplatesWithInitialVersion(): Promise<{
  templates: Awaited<ReturnType<typeof listEmailTemplates>>;
  templateVersionsById: EmailTemplateVersionsById;
}> {
  const templates = await listEmailTemplates();
  const initialVersionId =
    templates.find((template) => template.current_version_id)
      ?.current_version_id ?? null;
  const templateVersionsById: EmailTemplateVersionsById = {};

  if (initialVersionId) {
    const version = await getEmailTemplateVersion(initialVersionId);
    if (version) {
      templateVersionsById[initialVersionId] = {
        builderJson: version.builder_json,
      };
    }
  }

  return {
    templates,
    templateVersionsById,
  };
}

export async function loadEmailTemplatesAction() {
  await requireAdmin();
  return loadTemplatesWithInitialVersion();
}

export async function loadEmailSendsAction() {
  await requireAdmin();
  const sends = await listEmailSends();
  return { sends };
}

export async function loadEmailManualRecipientsAction() {
  await requireAdmin();
  const manualRecipients = await listEmailManualRecipients();
  return { manualRecipients };
}

export async function saveEmailManualRecipientAction(input: {
  email: string;
  name?: string;
  notes?: string;
}) {
  await requireAdmin();
  const parsed = manualRecipientSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(
      parsed.error.issues[0]?.message ?? "Invalid saved recipient",
    );
  }
  const manualRecipient = await upsertEmailManualRecipient({
    email: parsed.data.email,
    name: parsed.data.name ?? "",
    notes: parsed.data.notes ?? "",
  });
  revalidatePath("/admin");
  return { manualRecipient };
}

export async function loadEmailStudioDataAction() {
  await requireAdmin();
  const [templateData, sends] = await Promise.all([
    loadTemplatesWithInitialVersion(),
    listEmailSends(),
  ]);

  return {
    ...templateData,
    sends,
  };
}

// Expand any selected lists + segments into the contact / manual recipient ids
// they resolve to, merged with the ad-hoc selection. Lists are frozen members;
// segments are re-evaluated now. Both target specific people, so outreach only.
async function expandRecipientSelection(input: {
  kind: EmailSendKind;
  contactIds?: string[];
  manualRecipientIds?: string[];
  listIds?: string[];
  segmentIds?: string[];
}): Promise<{ contactIds: string[]; manualRecipientIds: string[] }> {
  const contactIds = [...(input.contactIds ?? [])];
  const manualRecipientIds = [...(input.manualRecipientIds ?? [])];
  if (input.kind !== "outreach") {
    return { contactIds, manualRecipientIds };
  }
  if (input.listIds?.length) {
    const fromLists = await resolveEmailListRecipientIds(input.listIds);
    contactIds.push(...fromLists.contactIds);
    manualRecipientIds.push(...fromLists.manualRecipientIds);
  }
  if (input.segmentIds?.length) {
    const fromSegments = await resolveSegmentsContactIds(input.segmentIds);
    contactIds.push(...fromSegments);
  }
  return { contactIds, manualRecipientIds };
}

async function resolvePreview(input: {
  kind: EmailSendKind;
  contactIds?: string[];
  manualRecipientIds?: string[];
  listIds?: string[];
  segmentIds?: string[];
}) {
  const expanded = await expandRecipientSelection(input);
  const selectedContactIds = Array.from(new Set(expanded.contactIds));
  const selectedManualRecipientIds = Array.from(
    new Set(expanded.manualRecipientIds),
  );
  if (input.kind === "outreach") {
    if (
      selectedContactIds.length === 0 &&
      selectedManualRecipientIds.length === 0
    ) {
      throw new Error("Select at least one recipient");
    }
    for (const contactId of selectedContactIds) validateUUID(contactId, "contact");
    for (const recipientId of selectedManualRecipientIds) {
      validateUUID(recipientId, "saved recipient");
    }
  }
  if (input.kind === "broadcast" && selectedManualRecipientIds.length > 0) {
    throw new Error("Manual recipients can only be used for outreach");
  }
  // The UI sends [] for these on broadcast, but the action is the trust boundary:
  // a broadcast carrying a list/segment would mail everyone yet be labelled as a
  // scoped send. Reject loudly instead of silently dropping the audience.
  if (
    input.kind === "broadcast" &&
    ((input.listIds?.length ?? 0) > 0 || (input.segmentIds?.length ?? 0) > 0)
  ) {
    throw new Error("Lists and segments can only be used for outreach");
  }

  const [contacts, preferences, suppressions, manualRecipients] =
    await Promise.all([
    getContacts(),
    listContactEmailPreferences(),
    listActiveEmailSuppressions(),
      input.kind === "outreach" && selectedManualRecipientIds.length > 0
        ? getEmailManualRecipientsByIds(selectedManualRecipientIds)
        : Promise.resolve([] as EmailManualRecipient[]),
    ]);

  const contactPreview =
    input.kind === "outreach" && selectedContactIds.length === 0
      ? { eligible: [], skipped: [] }
      : resolveEmailEligibility({
          kind: input.kind,
          contacts,
          preferences,
          suppressions,
          selectedContactIds,
        });

  const manualPreview = resolveManualRecipientEligibility({
    manualRecipients,
    selectedManualRecipientIds,
    suppressions,
    contactEmails: [
      ...contactPreview.eligible.map((recipient) => recipient.email),
      ...contactPreview.skipped.map((recipient) => recipient.email),
    ],
  });

  return {
    eligible: [...contactPreview.eligible, ...manualPreview.eligible],
    skipped: [...contactPreview.skipped, ...manualPreview.skipped],
  };
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

function resolveManualRecipientEligibility(input: {
  manualRecipients: EmailManualRecipient[];
  selectedManualRecipientIds: string[];
  suppressions: EmailSuppression[];
  contactEmails: string[];
}): {
  eligible: ResolvedManualEligibleRecipient[];
  skipped: ResolvedManualSkippedRecipient[];
} {
  if (input.selectedManualRecipientIds.length === 0) {
    return { eligible: [], skipped: [] };
  }

  const manualRecipientsById = new Map(
    input.manualRecipients.map((recipient) => [recipient.id, recipient]),
  );
  const missingIds = input.selectedManualRecipientIds.filter(
    (recipientId) => !manualRecipientsById.has(recipientId),
  );
  if (missingIds.length > 0) {
    throw new Error("Saved recipient not found");
  }

  const selectedContactEmails = new Set(input.contactEmails.map(normalizeEmail));
  const suppressedEmails = new Set(
    input.suppressions
      .filter((suppression) => !suppression.lifted_at)
      .map((suppression) => normalizeEmail(suppression.email)),
  );

  const eligible: ResolvedManualEligibleRecipient[] = [];
  const skipped: ResolvedManualSkippedRecipient[] = [];
  for (const recipientId of input.selectedManualRecipientIds) {
    const recipient = manualRecipientsById.get(recipientId);
    if (!recipient) continue;
    const email = normalizeEmail(recipient.email);
    if (selectedContactEmails.has(email)) {
      throw new Error(
        `Manual recipient ${email} duplicates a selected contact email`,
      );
    }
    const name = recipient.name.trim() || email;
    const base = {
      contactId: null,
      email,
      name,
      personalization: {
        contact: {
          id: recipient.id,
          name,
          email,
        },
        manualRecipient: {
          id: recipient.id,
        },
      },
    } satisfies ResolvedManualEligibleRecipient;

    if (suppressedEmails.has(email)) {
      skipped.push({
        ...base,
        status: "skipped_suppressed",
        reason: "suppressed",
      });
    } else {
      eligible.push(base);
    }
  }
  return { eligible, skipped };
}

export async function previewEmailAction(input: {
  kind: EmailSendKind;
  contactIds?: string[];
  manualRecipientIds?: string[];
  subject: string;
}): Promise<{
  eligibleCount: number;
  skipped: Array<{
    contactId: string | null;
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

  const preview = await resolvePreview(parsed.data);
  return {
    eligibleCount: preview.eligible.length,
    skipped: preview.skipped,
  };
}

// Sample values so variable placeholders render as realistic text in the
// compose preview (the real send substitutes each recipient's own values).
const COMPOSE_PREVIEW_VARIABLES = {
  contact: { name: "Alex Rivera", email: "alex@example.com" },
  owner: { name: "Behind The Mask", email: "hello@behind-the-mask.com" },
};

const composePreviewSchema = z.object({
  builderJson: z.unknown(),
  subject: z.string().optional(),
  previewText: z.string().optional(),
});

/**
 * Render the current compose document to the exact HTML the recipient will
 * receive (same renderer + theme as the send pipeline), so the composer can
 * preview the final email. Variables use sample values; the broadcast
 * unsubscribe footer is added by the send pipeline, not here.
 */
export async function renderComposePreviewAction(input: {
  builderJson: unknown;
  subject?: string;
  previewText?: string;
}): Promise<{ subject: string; html: string }> {
  await requireAdmin();
  const parsed = composePreviewSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email preview");
  }

  const document = assertMailyDocument(parsed.data.builderJson);
  const rendered = await renderMailyEmail({
    subject: parsed.data.subject?.trim() || "(no subject)",
    previewText: parsed.data.previewText?.trim() || undefined,
    document,
    variables: COMPOSE_PREVIEW_VARIABLES,
  });
  return { subject: rendered.subject, html: rendered.html };
}

const composeRecipientsSchema = z.object({
  kind: emailKindSchema,
  contactIds: z.array(z.string()).optional(),
  manualRecipientIds: z.array(z.string()).optional(),
  listIds: z.array(z.string()).optional(),
  segmentIds: z.array(z.string()).optional(),
});

export interface ComposeRecipient {
  name: string;
  email: string;
  source: "contact" | "manual";
}

export interface ComposeSkippedRecipient extends ComposeRecipient {
  reason: string;
}

/**
 * Resolve the actual people an outreach send will reach, so the composer can
 * list them by name instead of showing only a count. Returns eligible
 * recipients plus the ones that will be skipped (suppressed / unsubscribed) and
 * why. Broadcast is intentionally not itemized — it targets every contact with
 * an email, so the composer keeps a summary for it.
 */
export async function getComposeRecipientsAction(input: {
  kind: EmailSendKind;
  contactIds?: string[];
  manualRecipientIds?: string[];
  listIds?: string[];
  segmentIds?: string[];
}): Promise<{
  eligible: ComposeRecipient[];
  skipped: ComposeSkippedRecipient[];
}> {
  await requireAdmin();
  const parsed = composeRecipientsSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid recipients");
  }

  if (parsed.data.kind !== "outreach") {
    return { eligible: [], skipped: [] };
  }

  const hasSelection =
    (parsed.data.contactIds?.length ?? 0) +
      (parsed.data.manualRecipientIds?.length ?? 0) +
      (parsed.data.listIds?.length ?? 0) +
      (parsed.data.segmentIds?.length ?? 0) >
    0;
  if (!hasSelection) {
    return { eligible: [], skipped: [] };
  }

  const preview = await resolvePreview(parsed.data);
  const sourceOf = (contactId: string | null): "contact" | "manual" =>
    contactId ? "contact" : "manual";

  return {
    eligible: preview.eligible.map((recipient) => ({
      name: recipient.name,
      email: recipient.email,
      source: sourceOf(recipient.contactId),
    })),
    skipped: preview.skipped.map((recipient) => ({
      name: recipient.name,
      email: recipient.email,
      source: sourceOf(recipient.contactId),
      reason: recipient.reason,
    })),
  };
}

export async function createEmailDraftAction(input: {
  kind: EmailSendKind;
  name?: string;
  subject: string;
  builderJson: unknown;
  previewText?: string;
  contactIds?: string[];
  manualRecipientIds?: string[];
  listIds?: string[];
  segmentIds?: string[];
  audience?: AudienceSourceInput;
}): Promise<{ sendId: string }> {
  await requireAdmin();
  const parsed = draftEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email draft");
  }

  const send = await createEmailSend(parsed.data);
  revalidatePath("/admin");
  return { sendId: send.id };
}

// Record which audience source produced a send so the Sent tab can label it.
// Counts come from the admin's selection; selected mailing lists contribute
// their name as the label. Broadcast targets everyone, so counts are omitted.
async function buildSendMetadata(
  input: ParsedEmailSendInput,
): Promise<Record<string, unknown>> {
  const audience: Record<string, unknown> = { kind: input.kind };
  // Lists/segments only scope outreach; never let them label a broadcast (which
  // reaches everyone). resolvePreview already rejects the combination — this is
  // defence in depth so a mislabel can't slip through.
  if (input.kind !== "outreach") {
    return { editor: "maily", audience };
  }
  audience.contactCount = new Set(input.contactIds ?? []).size;
  audience.manualCount = new Set(input.manualRecipientIds ?? []).size;
  const labels: string[] = [];
  const listIds = input.listIds ?? [];
  if (listIds.length > 0) {
    audience.listIds = listIds;
    labels.push(...(await getEmailListNames(listIds)));
  }
  const segmentIds = input.segmentIds ?? [];
  if (segmentIds.length > 0) {
    audience.segmentIds = segmentIds;
    labels.push(...(await getEmailSegmentNames(segmentIds)));
  }
  if (labels.length > 0) audience.label = labels.join(", ");
  if (!audience.label && input.audience?.label) {
    audience.label = input.audience.label;
  }
  return { editor: "maily", audience };
}

async function createEmailSend(input: ParsedEmailSendInput) {
  const preview = await resolvePreview(input);
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
      personalization:
        "personalization" in recipient
          ? recipient.personalization
          : {
              contact: {
                id: recipient.contactId,
                name: recipient.name,
                email: recipient.email,
              },
            },
      skipReason: recipient.reason,
    })),
  ];

  const send = await createEmailSendWithRecipients({
    kind: input.kind,
    name,
    subjectTemplate: input.subject,
    previewText,
    fromEmail: getEmailFromEmail(),
    fromName: getEmailFromName(),
    replyToEmail: getEmailReplyToEmail(),
    templateVersionId: null,
    builderJsonSnapshot: document as Record<string, unknown>,
    htmlPreviewSnapshot: rendered.html,
    textPreviewSnapshot: rendered.text,
    metadata: await buildSendMetadata(input),
    recipients,
  });

  // Auto-save the design as a reusable template, deduped by content, and link it
  // back for provenance. Done AFTER the send so a failed send never leaves an
  // orphaned published template in the Start-from picker. Best-effort: the send
  // is already recorded and will go out even if this bookkeeping fails.
  try {
    const { templateVersionId } = await findOrCreateTemplateForDocument({
      builderJson: document,
      subject: input.subject,
    });
    await setEmailSendTemplateVersion(send.id, templateVersionId);
    send.template_version_id = templateVersionId;
  } catch (error) {
    console.error(
      `Auto-save template failed for send ${send.id}; the email still sends.`,
      error,
    );
  }

  return send;
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
  builderJson: unknown;
  previewText?: string;
  contactIds?: string[];
  manualRecipientIds?: string[];
  listIds?: string[];
  segmentIds?: string[];
  audience?: AudienceSourceInput;
}): Promise<{ sendId: string }> {
  await requireAdmin();
  const parsed = draftEmailSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid email send");
  }

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

export async function loadEmailExclusionsAction(): Promise<{
  exclusions: EmailExclusionRow[];
}> {
  await requireAdmin();
  const exclusions = await listEmailExclusions();
  return { exclusions };
}

export async function liftEmailExclusionAction(
  suppressionId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(suppressionId, "exclusion");
  await liftEmailExclusion(suppressionId);
  revalidatePath("/admin");
  return { ok: true };
}

// Manually exclude a contact straight from the Excluded list. The email is
// resolved server-side from the contact id (never trusted from the client).
export async function excludeContactFromEmailAction(
  contactId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(contactId, "contact");
  const contact = await getContactById(contactId);
  if (!contact) throw new Error("Contact not found");
  await excludeContactEmail({ contactId, email: contact.email });
  revalidatePath("/admin");
  return { ok: true };
}

const emailListInputSchema = z.object({
  name: z.string().trim().min(1, "List name is required").max(120),
  description: z.string().trim().max(500).optional(),
  contactIds: z.array(z.string()).optional(),
  manualRecipientIds: z.array(z.string()).optional(),
});

export async function loadEmailListsAction(): Promise<{
  lists: EmailListSummary[];
}> {
  await requireAdmin();
  const lists = await listEmailLists();
  return { lists };
}

export async function getEmailListAction(listId: string): Promise<{
  list: EmailList;
  members: EmailListMemberRow[];
} | null> {
  await requireAdmin();
  validateUUID(listId, "list");
  return getEmailListWithMembers(listId);
}

export async function createEmailListAction(input: {
  name: string;
  description?: string;
  contactIds?: string[];
  manualRecipientIds?: string[];
}): Promise<{ list: EmailList }> {
  await requireAdmin();
  const parsed = emailListInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid mailing list");
  }
  for (const id of parsed.data.contactIds ?? []) validateUUID(id, "contact");
  for (const id of parsed.data.manualRecipientIds ?? []) {
    validateUUID(id, "saved recipient");
  }
  const list = await createEmailList(parsed.data);
  revalidatePath("/admin");
  return { list };
}

export async function updateEmailListAction(input: {
  id: string;
  name: string;
  description?: string;
}): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(input.id, "list");
  const parsed = emailListInputSchema
    .pick({ name: true, description: true })
    .safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid mailing list");
  }
  await updateEmailList({
    id: input.id,
    name: parsed.data.name,
    description: parsed.data.description,
  });
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteEmailListAction(
  listId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(listId, "list");
  await deleteEmailList(listId);
  revalidatePath("/admin");
  return { ok: true };
}

export async function addEmailListMembersAction(input: {
  listId: string;
  contactIds?: string[];
  manualRecipientIds?: string[];
}): Promise<{ added: number }> {
  await requireAdmin();
  validateUUID(input.listId, "list");
  for (const id of input.contactIds ?? []) validateUUID(id, "contact");
  for (const id of input.manualRecipientIds ?? []) {
    validateUUID(id, "saved recipient");
  }
  const result = await addEmailListMembers(input);
  revalidatePath("/admin");
  return result;
}

export async function removeEmailListMemberAction(
  memberId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(memberId, "list member");
  await removeEmailListMember(memberId);
  revalidatePath("/admin");
  return { ok: true };
}

const segmentRuleSchema = z.object({
  match: z.enum(["all", "any"]),
  includeTagIds: z.array(z.string()),
  excludeTagIds: z.array(z.string()),
});

const emailSegmentInputSchema = z.object({
  name: z.string().trim().min(1, "Segment name is required").max(120),
  description: z.string().trim().max(500).optional(),
  rule: segmentRuleSchema,
});

function validateSegmentTagIds(rule: EmailSegmentRule) {
  for (const id of rule.includeTagIds) validateUUID(id, "tag");
  for (const id of rule.excludeTagIds) validateUUID(id, "tag");
}

export async function loadEmailSegmentsAction(): Promise<{
  segments: EmailSegmentSummary[];
}> {
  await requireAdmin();
  const segments = await listEmailSegments();
  return { segments };
}

export async function loadAudienceTagsAction(): Promise<{
  categories: TagCategory[];
  tags: Tag[];
}> {
  await requireAdmin();
  const [categories, tags] = await Promise.all([getTagCategories(), getTags()]);
  return { categories, tags };
}

export async function loadAudienceContactsAction(): Promise<{
  contacts: Array<{ id: string; name: string; email: string }>;
}> {
  await requireAdmin();
  const contacts = await getContacts();
  return {
    contacts: contacts.map((contact) => ({
      id: contact.id,
      name: contact.name,
      email: contact.email,
    })),
  };
}

export async function previewSegmentCountAction(
  rule: EmailSegmentRule,
): Promise<{ count: number }> {
  await requireAdmin();
  const parsed = segmentRuleSchema.safeParse(rule);
  if (!parsed.success) throw new Error("Invalid segment rule");
  validateSegmentTagIds(parsed.data);
  const count = await countSegmentMatches(parsed.data);
  return { count };
}

export async function createEmailSegmentAction(input: {
  name: string;
  description?: string;
  rule: EmailSegmentRule;
}): Promise<{ segment: EmailSegment }> {
  await requireAdmin();
  const parsed = emailSegmentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid segment");
  }
  validateSegmentTagIds(parsed.data.rule);
  const segment = await createEmailSegment(parsed.data);
  revalidatePath("/admin");
  return { segment };
}

export async function updateEmailSegmentAction(input: {
  id: string;
  name: string;
  description?: string;
  rule: EmailSegmentRule;
}): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(input.id, "segment");
  const parsed = emailSegmentInputSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(parsed.error.issues[0]?.message ?? "Invalid segment");
  }
  validateSegmentTagIds(parsed.data.rule);
  await updateEmailSegment({ id: input.id, ...parsed.data });
  revalidatePath("/admin");
  return { ok: true };
}

export async function deleteEmailSegmentAction(
  segmentId: string,
): Promise<{ ok: true }> {
  await requireAdmin();
  validateUUID(segmentId, "segment");
  await deleteEmailSegment(segmentId);
  revalidatePath("/admin");
  return { ok: true };
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

/**
 * Resolve the saved template name + version a sent campaign was rendered from,
 * so the Sent emails preview can show exactly which template version went out.
 */
export type { EmailSendTemplateInfo };

export async function getEmailSendTemplateInfoAction(
  sendId: string,
): Promise<EmailSendTemplateInfo | null> {
  await requireAdmin();
  validateUUID(sendId, "email send");
  return getEmailSendTemplateInfo(sendId);
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
